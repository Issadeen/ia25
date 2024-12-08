export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../[...nextauth]/auth';
import { adminAuth } from '@/lib/firebase-admin';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email || !session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Now TypeScript knows session.user.id is defined
    const customToken = await adminAuth.createCustomToken(session.user.id);

    // Ensure the custom Firebase token is used during login
    session.firebaseToken = customToken;

    return NextResponse.json({ customToken });
  } catch (error) {
    console.error('Error creating custom token:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}