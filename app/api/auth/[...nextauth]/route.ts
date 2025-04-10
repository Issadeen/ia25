import NextAuth from "next-auth"
import { authOptions } from "@/lib/auth"

// Export the handler functions without exporting authOptions
const handler = NextAuth(authOptions)
export { handler as GET, handler as POST, authOptions }

