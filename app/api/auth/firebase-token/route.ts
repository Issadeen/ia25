import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/firebase-admin';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      const adminAuth = initAdmin();
      if (!adminAuth) {
        throw new Error('Failed to initialize Firebase Admin');
      }
      
      const customToken = await adminAuth.createCustomToken(session.user.email);
      return NextResponse.json({ customToken });
    } catch (adminError: any) {
      console.error('Firebase admin error:', adminError);
      return NextResponse.json(
        { error: 'Firebase authentication failed', details: adminError.message },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Session error:', error);
    return NextResponse.json(
      { error: 'Session validation failed', details: error.message },
      { status: 500 }
    );
  }
}