import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/firebase-admin';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      const adminAuth = initAdmin();
      const customToken = await adminAuth.createCustomToken(session.user.id);
      return NextResponse.json({ customToken });
    } catch (error) {
      console.error('Firebase admin initialization error:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Firebase admin initialization failed' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Firebase token error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}