/**
 * One-time fix script to create credit records for existing overpayments
 * This handles overpayments that occurred before the credit system was implemented
 */

import { database } from "@/lib/firebase"
import { ref, get, update } from "firebase/database"
import { toFixed2 } from "@/lib/utils"

interface TruckPayment {
  amount: number
  timestamp: string
  paymentId: string
  note?: string
}

interface WorkDetail {
  id: string
  truck_number: string
  at20: string | number
  price: string | number
  loaded: boolean
}

async function fixOverpaymentCredits(owner: string) {
  console.log(`Starting fix for owner: ${owner}`)

  try {
    // Get all work details for this owner
    const workDetailsRef = ref(database, `work_details`)
    const workDetailsSnapshot = await get(workDetailsRef)
    
    if (!workDetailsSnapshot.exists()) {
      console.log("No work details found")
      return
    }

    const allWorkDetails = workDetailsSnapshot.val()
    const ownerTrucks = Object.values(allWorkDetails).filter((truck: any) => 
      truck.owner === owner && truck.loaded
    ) as WorkDetail[]

    console.log(`Found ${ownerTrucks.length} loaded trucks for owner ${owner}`)

    // Get truck payments
    const truckPaymentsRef = ref(database, `truckPayments`)
    const truckPaymentsSnapshot = await get(truckPaymentsRef)
    const truckPayments: { [truckId: string]: TruckPayment[] } = {}

    if (truckPaymentsSnapshot.exists()) {
      const allPayments = truckPaymentsSnapshot.val()
      for (const [truckId, payments] of Object.entries(allPayments)) {
        truckPayments[truckId] = Object.values(payments as any)
      }
    }

    console.log(`Got truck payments:`, Object.keys(truckPayments))

    const updates: { [path: string]: any } = {}
    let creditsCreated = 0

    // Check each truck for overpayment
    for (const truck of ownerTrucks) {
      const payments = truckPayments[truck.id] || []
      const totalAllocated = toFixed2(payments.reduce((sum, p) => sum + p.amount, 0))
      const totalDue = truck.at20 
        ? toFixed2(parseFloat(truck.at20 as string) * parseFloat(truck.price as string))
        : 0

      const balance = toFixed2(totalDue - totalAllocated)

      console.log(`Truck ${truck.truck_number}:`, {
        totalDue,
        totalAllocated,
        balance
      })

      // If there's an overpayment (negative balance), create credit record
      if (balance < 0) {
        const creditAmount = toFixed2(Math.abs(balance))
        const creditId = `credit_retroactive_${truck.id}_${Date.now()}`

        console.log(`Creating credit for ${truck.truck_number}: $${creditAmount}`)

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

        creditsCreated++
      }
    }

    if (creditsCreated > 0) {
      console.log(`Writing ${creditsCreated} credit records to Firebase...`)
      await update(ref(database), updates)
      console.log("✅ Credits created successfully!")
      return {
        success: true,
        creditsCreated,
        message: `Created ${creditsCreated} credit records for ${owner}`
      }
    } else {
      console.log("No overpayments found")
      return {
        success: true,
        creditsCreated: 0,
        message: "No overpayments to credit"
      }
    }
  } catch (error) {
    console.error("Error fixing overpayment credits:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

// Export for use in a dashboard admin function
export default fixOverpaymentCredits
