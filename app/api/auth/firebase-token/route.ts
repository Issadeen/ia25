import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getFirebaseAdminAuth } from '@/lib/firebase-admin';
import { NextRequest } from 'next/server';

// Define the expected shape of the token (matching the jwt callback)
interface AppToken {
  id?: string;
  email?: string;
  // Include other properties if they exist in your token
  name?: string;
  picture?: string;
  sub?: string;
  iat?: number;
  exp?: number;
  jti?: string;
}

export async function GET(req: NextRequest) {
  try {
    // Use getToken to get the full JWT token content server-side
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET }) as AppToken | null;

    // Check for token and necessary properties (id for Firebase custom token)
    if (!token) {
      console.error("[Firebase Token API] No token found in request");
      return NextResponse.json({ error: 'No authentication token found' }, { status: 401 });
    }

    if (!token.id) {
      console.error("[Firebase Token API] Token missing ID property:", JSON.stringify(token, null, 2));
      return NextResponse.json({ error: 'Missing user ID in token' }, { status: 400 });
    }

    // Use token.id (which corresponds to user.workId) for the custom token
    const uid = token.id;

    console.log(`[Firebase Token API] Creating custom token for UID: ${uid}, email: ${token.email}`);
    const adminAuth = getFirebaseAdminAuth();
    
    try {
      const customToken = await adminAuth.createCustomToken(uid);
      console.log(`[Firebase Token API] Custom token created successfully for UID: ${uid}`);
      return NextResponse.json({ customToken });
    } catch (firebaseError) {
      console.error(`[Firebase Token API] Firebase error creating token for UID ${uid}:`, firebaseError);
      return NextResponse.json({ 
        error: 'Failed to create Firebase token',
        details: firebaseError instanceof Error ? firebaseError.message : 'Unknown Firebase error' 
      }, { status: 500 });
    }
  } catch (error) {
    console.error(`[Firebase Token API] Unexpected error:`, error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}