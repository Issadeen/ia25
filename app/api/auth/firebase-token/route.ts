import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt'; // Import getToken
import { getFirebaseAdminAuth } from '@/lib/firebase-admin';
import { NextRequest } from 'next/server'; // Import NextRequest

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
  // Use getToken to get the full JWT token content server-side
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET }) as AppToken | null;

  // Check for token and necessary properties (id for Firebase custom token)
  if (!token || !token.id) {
    console.error("[Firebase Token API] Unauthorized: Token missing or missing ID property.");
    return NextResponse.json({ error: 'Unauthorized or missing user ID in token' }, { status: 401 });
  }

  // Use token.id (which corresponds to user.workId) for the custom token
  const uid = token.id;
  // You can also access token.email if needed for logging or other purposes server-side
  // const email = token.email;

  try {
    console.log(`[Firebase Token API] Creating custom token for UID: ${uid}`);
    const adminAuth = getFirebaseAdminAuth();
    const customToken = await adminAuth.createCustomToken(uid);
    console.log(`[Firebase Token API] Custom token created successfully for UID: ${uid}`);
    return NextResponse.json({ firebaseToken: customToken });
  } catch (error) {
    console.error(`[Firebase Token API] Error creating custom token for UID ${uid}:`, error);
    return NextResponse.json({ error: 'Failed to create Firebase token' }, { status: 500 });
  }
}