import { getServerSession } from "next-auth/next"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { getToken } from "next-auth/jwt"

export async function GET(request: Request) {
  try {
    // Get the session
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    
    console.log("[Debug Token] Got session:", JSON.stringify(session, null, 2))
    
    // Get the token using getToken with the request object
    const secret = process.env.NEXTAUTH_SECRET
    const token = await getToken({ 
      req: request as any, 
      secret 
    })
    
    console.log("[Debug Token] Got token:", JSON.stringify(token, null, 2))
    
    // Return debug information
    return NextResponse.json({
      sessionData: {
        // Only include non-sensitive session data
        user: session.user,
        expires: session.expires
      },
      tokenData: {
        id: token?.id,
        email: token?.email,
        name: token?.name,
        picture: token?.picture,
        // Include any other relevant token fields
        iat: token?.iat,
        exp: token?.exp,
        jti: token?.jti
      },
      fullToken: token // Return the full token for debugging
    })
  } catch (error) {
    console.error("Error in debug-token route:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
