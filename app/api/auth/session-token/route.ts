import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function GET(request: Request) {
  try {
    // Get the secret for JWT verification
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      console.error("NEXTAUTH_SECRET is not set");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // Get the token from the request
    const token = await getToken({ 
      req: request as any, 
      secret 
    });

    if (!token) {
      return NextResponse.json({ error: "Invalid session token" }, { status: 401 });
    }

    // Return only the essential fields needed for verification
    return NextResponse.json({
      token: {
        workId: token.workId,
        email: token.email,
        name: token.name,
      }
    });
  } catch (error) {
    console.error("Error fetching session token:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
