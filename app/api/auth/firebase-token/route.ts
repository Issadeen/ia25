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

    // Improve token validation logic for better error reporting
    if (!token) {
      console.error("[Firebase Token API] No token found in request");
      return NextResponse.json({ error: 'No authentication token found' }, { status: 401 });
    }

    // Check token properties and provide more specific error messages
    if (!token.id && !token.sub) {
      console.error("[Firebase Token API] Token missing both ID and SUB properties:", 
        JSON.stringify({...token, email: token.email ? `${token.email.substring(0,3)}...` : null}, null, 2));
      return NextResponse.json({ error: 'Missing user ID in token' }, { status: 400 });
    }

    // Prioritize token.id but fall back to sub if needed
    const uid = token.id || token.sub;
    
    // This check is redundant with the one above but keeps TypeScript happy
    if (!uid) {
      console.error("[Firebase Token API] UID is undefined even after validation check");
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    // Add request tracing ID to help with debugging
    const requestId = Math.random().toString(36).substring(2, 10);
    console.log(`[Firebase Token API] [${requestId}] Creating custom token for UID: ${uid}`);
    
    const adminAuth = getFirebaseAdminAuth();
    
    try {
      // Add timeout handling for Firebase admin operations
      const tokenPromise = adminAuth.createCustomToken(uid);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Firebase token creation timed out")), 5000));
      
      // Race the token creation against a timeout
      const customToken = await Promise.race([tokenPromise, timeoutPromise]) as string;
      
      console.log(`[Firebase Token API] [${requestId}] Custom token created successfully`);
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