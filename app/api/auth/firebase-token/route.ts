import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/firebase-admin';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      console.error('No user ID in session');
      return NextResponse.json(
        { error: 'Unauthorized', details: 'No valid session' },
        { status: 401 }
      );
    }

    let adminAuth;
    try {
      adminAuth = initAdmin();
    } catch (error) {
      console.error('Admin initialization error:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to initialize Firebase Admin'
      );
    }

    const customToken = await adminAuth.createCustomToken(session.user.id);
    console.log('Custom token created for user:', session.user.id);

    return NextResponse.json({ customToken });
    
  } catch (error) {
    console.error('Token generation failed:', error);
    return NextResponse.json(
      { 
        error: 'Authentication failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}