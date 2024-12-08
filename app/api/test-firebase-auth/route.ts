
import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Firebase auth failed:', data.error);
      return NextResponse.json({ error: data.error.message }, { status: 401 });
    }

    const userRecord = await adminAuth.getUser(data.localId);
    return NextResponse.json({ user: userRecord });
  } catch (error) {
    console.error('Error testing Firebase auth:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}