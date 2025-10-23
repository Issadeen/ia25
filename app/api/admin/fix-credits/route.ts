import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import { NextRequest, NextResponse } from 'next/server'
import { toFixed2 } from '@/lib/utils'

// Initialize Firebase Admin SDK
function initializeAdmin() {
  if (getApps().length > 0) {
    return getApps()[0]
  }

  const serviceAccount = {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }

  return initializeApp({
    credential: cert(serviceAccount as any),
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  })
}

export async function POST(request: NextRequest) {
  try {
    const { owner } = await request.json()

    if (!owner) {
      return NextResponse.json(
        { error: 'Owner parameter required' },
        { status: 400 }
      )
    }

    // Initialize Admin SDK
    const app = initializeAdmin()
    const db = getDatabase(app)

    // IDEMPOTENCY CHECK: Only run once per owner
    // Check if retroactive credits have already been created
    const existingCreditsRef = db.ref(`owner_credits/${owner}`)
    const existingCreditsSnapshot = await existingCreditsRef.get()
    
    if (existingCreditsSnapshot.exists()) {
      const existingCredits = existingCreditsSnapshot.val()
      const retroactiveCredits = Object.values(existingCredits).filter(
        (credit: any) => credit.source === 'overpayment_retroactive'
      )
      
      if (retroactiveCredits.length > 0) {
        return NextResponse.json({
          success: true,
          creditsCreated: 0,
          alreadyProcessed: true,
          message: `Credits already processed for ${owner}. This is a one-time operation to prevent duplicate credits.`
        })
      }
    }

    // Get all work details
    const workDetailsRef = db.ref('work_details')
    const workDetailsSnapshot = await workDetailsRef.get()

    if (!workDetailsSnapshot.exists()) {
      return NextResponse.json({ error: 'No work details found' }, { status: 404 })
    }

    const allWorkDetails = workDetailsSnapshot.val()
    const ownerTrucks = Object.entries(allWorkDetails)
      .filter(([_, truck]: any) => truck.owner === owner && truck.loaded)
      .map(([id, truck]: any) => ({ ...truck, id }))

    // Get truck payments
    const truckPaymentsRef = db.ref('truckPayments')
    const truckPaymentsSnapshot = await truckPaymentsRef.get()
    const truckPayments: { [truckId: string]: any[] } = {}

    if (truckPaymentsSnapshot.exists()) {
      const allPayments = truckPaymentsSnapshot.val()
      for (const [truckId, payments] of Object.entries(allPayments)) {
        truckPayments[truckId] = Object.values(payments as any)
      }
    }

    const updates: { [path: string]: any } = {}
    let creditsCreated = 0
    let totalCreditAmount = 0
    const creditsData: any[] = []

    // Check each truck for overpayment
    for (const truck of ownerTrucks) {
      const payments = truckPayments[truck.id] || []
      const totalAllocated = toFixed2(payments.reduce((sum: number, p: any) => sum + p.amount, 0))
      const totalDue = truck.at20
        ? toFixed2(parseFloat(truck.at20) * parseFloat(truck.price))
        : 0

      const balance = toFixed2(totalDue - totalAllocated)

      // If there's an overpayment (negative balance), create credit record
      if (balance < 0) {
        const creditAmount = toFixed2(Math.abs(balance))
        const creditId = `credit_retroactive_${truck.id}_${Date.now()}`

        updates[`owner_credits/${owner}/${creditId}`] = {
          id: creditId,
          truckId: truck.id,
          truckNumber: truck.truck_number,
          amount: creditAmount,
          timestamp: new Date().toISOString(),
          source: 'overpayment_retroactive',
          status: 'available',
          note: `Retroactive credit from overpayment on ${truck.truck_number}`
        }

        // Also add to balance usage history
        const historyId = `history_retroactive_${truck.id}_${Date.now()}`
        updates[`balance_usage/${owner}/${historyId}`] = {
          amount: creditAmount,
          timestamp: new Date().toISOString(),
          type: 'deposit',
          usedFor: [truck.id],
          paymentId: creditId,
          note: `Retroactive credit: Overpayment on truck ${truck.truck_number}: -$${creditAmount}`
        }

        totalCreditAmount = toFixed2(totalCreditAmount + creditAmount)
        creditsCreated++
        creditsData.push({
          truck: truck.truck_number,
          creditAmount,
          creditId
        })
      }
    }

    if (creditsCreated > 0) {
      // Get current owner balance
      const ownerBalanceRef = db.ref(`owner_balances/${owner}`)
      const ownerBalanceSnapshot = await ownerBalanceRef.get()
      const currentBalance = ownerBalanceSnapshot.exists() ? ownerBalanceSnapshot.val().amount || 0 : 0
      
      // Update owner_balances with the new credit amount added
      const newBalance = toFixed2(currentBalance + totalCreditAmount)
      updates[`owner_balances/${owner}`] = {
        amount: newBalance,
        lastUpdated: new Date().toISOString(),
        note: `Updated with retroactive credits from overpayments. Previous: $${currentBalance}, Credits Added: $${totalCreditAmount}`
      }
      
      // Use Admin SDK to write updates
      const rootRef = db.ref()
      await rootRef.update(updates)
      
      return NextResponse.json({
        success: true,
        creditsCreated,
        credits: creditsData,
        message: `Created ${creditsCreated} credit records for ${owner}`
      })
    } else {
      return NextResponse.json({
        success: true,
        creditsCreated: 0,
        message: 'No overpayments to credit'
      })
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
