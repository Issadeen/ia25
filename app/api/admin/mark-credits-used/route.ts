import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import { NextRequest, NextResponse } from 'next/server'

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
    const { owner, creditIds } = await request.json()

    if (!owner) {
      return NextResponse.json(
        { error: 'Owner parameter required' },
        { status: 400 }
      )
    }

    if (!creditIds || creditIds.length === 0) {
      return NextResponse.json(
        { error: 'No credit IDs provided' },
        { status: 400 }
      )
    }

    // Initialize Admin SDK
    const app = initializeAdmin()
    const db = getDatabase(app)

    const updates: { [path: string]: any } = {}
    let creditsMarked = 0
    let totalAmount = 0

    for (const creditId of creditIds) {
      const creditRef = db.ref(`owner_credits/${owner}/${creditId}`)
      const snapshot = await creditRef.get()

      if (snapshot.exists()) {
        const credit = snapshot.val()

        updates[`owner_credits/${owner}/${creditId}`] = {
          ...credit,
          status: 'used',
          usedAt: new Date().toISOString()
        }

        creditsMarked++
        totalAmount += credit.amount || 0
      }
    }

    if (creditsMarked > 0) {
      const rootRef = db.ref()
      await rootRef.update(updates)

      return NextResponse.json({
        success: true,
        creditsMarked,
        totalAmount,
        message: `Marked ${creditsMarked} credits as used (Total: $${totalAmount.toFixed(2)})`
      })
    } else {
      return NextResponse.json({
        success: true,
        creditsMarked: 0,
        message: 'No credits found to mark as used'
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
