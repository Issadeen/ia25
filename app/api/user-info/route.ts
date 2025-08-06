import { getServerSession } from "next-auth/next"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/auth" 
import { getToken } from "next-auth/jwt"

export async function GET(request: Request) {
  try {
    // Use getServerSession to get the session which includes the JWT token
    const session = await getServerSession(authOptions)

    if (!session || !session.user) {
      return NextResponse.json({ error: "User not authenticated" }, { status: 401 })
    }

    // Get the secret for JWT verification
    const secret = process.env.NEXTAUTH_SECRET
    if (!secret) {
      console.error("NEXTAUTH_SECRET is not set");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // We need to pass the request object to getToken for it to work properly
    const token = await getToken({ 
      req: request as any, 
      secret 
    });

    if (!token) {
      return NextResponse.json({ error: "Invalid session token" }, { status: 401 })
    }

    // Return minimal user info needed for the application to function
    // Note: email is only included because it's needed for existing workId verification flows
    // Consider using the /api/auth/verify-approver endpoint for workId verification instead
    return NextResponse.json({
      email: token.email, // Required for some existing verification flows
      name: token.name,
      image: token.picture,
      isAuthenticated: true
    })

  } catch (error) {
    console.error("Error fetching user info:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
