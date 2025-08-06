import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Checks if a session token has a valid workId
 * This can be used in middleware or API routes to verify sessions
 * 
 * @param req - Next request object
 * @returns Promise<boolean> - True if the session has a valid workId
 */
export async function hasValidWorkId(req: NextRequest): Promise<boolean> {
  try {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      console.error("NEXTAUTH_SECRET is not set");
      return false;
    }

    // Get the token from the request
    const token = await getToken({ 
      req: req as any, 
      secret 
    });

    // Check if token exists and has a workId
    return !!(token && token.workId);
  } catch (error) {
    console.error("Error checking workId in session:", error);
    return false;
  }
}

/**
 * Gets the workId from a session token
 * This can be used in middleware or API routes to get the workId
 * 
 * @param req - Next request object
 * @returns Promise<string | null> - The workId or null if not found
 */
export async function getWorkIdFromSession(req: NextRequest): Promise<string | null> {
  try {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      console.error("NEXTAUTH_SECRET is not set");
      return null;
    }

    // Get the token from the request
    const token = await getToken({ 
      req: req as any, 
      secret 
    });

    // Return the workId if it exists
    return token?.workId?.toString() || null;
  } catch (error) {
    console.error("Error getting workId from session:", error);
    return null;
  }
}

/**
 * Gets the email from a session token
 * This can be used in middleware or API routes to get the email
 * 
 * @param req - Next request object
 * @returns Promise<string | null> - The email or null if not found
 */
export async function getEmailFromSession(req: NextRequest): Promise<string | null> {
  try {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      console.error("NEXTAUTH_SECRET is not set");
      return null;
    }

    // Get the token from the request
    const token = await getToken({ 
      req: req as any, 
      secret 
    });

    // Return the email if it exists
    return token?.email?.toString() || null;
  } catch (error) {
    console.error("Error getting email from session:", error);
    return null;
  }
}
