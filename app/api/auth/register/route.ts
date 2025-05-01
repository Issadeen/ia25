import { NextResponse } from 'next/server'
import { getDatabase, ref, set } from 'firebase/database'
import { app } from '@/lib/firebase'
import bcrypt from 'bcrypt'

const saltRounds = 10; // Cost factor for hashing

export async function POST(request: Request) {
  try {
    const { email, password, workId } = await request.json()

    if (!email || !password || !workId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds)

    const database = getDatabase(app)
    const userRef = ref(database, `users/${workId}`)

    await set(userRef, {
      email: email.toLowerCase(),
      password: hashedPassword, // Store the hashed password
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
