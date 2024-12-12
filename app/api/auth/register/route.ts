import { NextResponse } from 'next/server'
import { getDatabase, ref, set } from 'firebase/database'
import { app } from '@/lib/firebase'

export async function POST(request: Request) {
  try {
    const { email, password, workId } = await request.json()
    
    const database = getDatabase(app)
    const userRef = ref(database, `users/${workId}`)
    
    await set(userRef, {
      email: email.toLowerCase(),
      password, // Store password in plain text (not recommended for production)
      workId,
      createdAt: new Date().toISOString()
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Failed to register user' },
      { status: 500 }
    )
  }
}
