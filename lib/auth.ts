import { AuthOptions } from "next-auth"

export const authOptions: AuthOptions = {
  // Your auth configuration here
  providers: [],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt'
  },
  // Add any other auth configuration options
}