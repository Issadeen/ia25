import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getFirebaseAdminDb } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { workId } = await request.json();

    if (!workId) {
      return NextResponse.json({ success: false, error: 'Work ID is required' }, { status: 400 });
    }

    // Use Firebase Admin SDK to bypass security rules
    const adminDb = getFirebaseAdminDb();
    const usersRef = adminDb.ref('users');
    
    // Query the database to find the user by email
    const snapshot = await usersRef.orderByChild('email').equalTo(session.user.email).once('value');

    if (!snapshot.exists()) {
      console.error(`Verification Error: User not found for email ${session.user.email}`);
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    let userData: any = null;
    snapshot.forEach((childSnapshot) => {
        // There should ideally be only one user per email
        userData = childSnapshot.val();
    });

    if (!userData) {
        // This case should ideally not happen if the query is correct
        console.error(`Verification Error: User data extraction failed for email ${session.user.email}`);
        return NextResponse.json({ success: false, error: 'User data not found' }, { status: 404 });
    }

    // Compare the provided workId with the one stored in the database
    if (userData.workId === workId) {
      console.log(`Verification Successful: User ${session.user.email} provided correct workId`);
      return NextResponse.json({ success: true });
    } else {
      console.warn(`Verification Failed: Provided workId "${workId}" does not match stored workId for email ${session.user.email}`);
      return NextResponse.json({ success: false, error: 'Invalid Work ID' }, { status: 403 });
    }

  } catch (error) {
    console.error('Verification API Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
