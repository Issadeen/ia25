import { getServerSession } from "next-auth/next"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/auth" // Assuming authOptions are correctly exported from lib/auth

export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session || !session.user) {
      return NextResponse.json({ error: "User not authenticated" }, { status: 401 })
    }

    const { cookies } = require('next/headers')
    const tokenCookie = cookies().get('next-auth.session-token') ?? cookies().get('__Secure-next-auth.session-token')

    if (!tokenCookie) {
       return NextResponse.json({ error: "Session token not found" }, { status: 401 })
    }

    const { getToken } = require("next-auth/jwt")
    const secret = process.env.NEXTAUTH_SECRET

    if (!secret) {
      console.error("NEXTAUTH_SECRET is not set");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const decodedToken = await getToken({ req: { cookies: cookies().getAll() } as any, secret });

    if (!decodedToken || !decodedToken.email) {
       return NextResponse.json({ error: "Invalid session or email not found in token" }, { status: 401 })
    }

    return NextResponse.json({ email: decodedToken.email })

  } catch (error) {
    console.error("Error fetching user info:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
