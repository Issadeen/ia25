import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { auth as firebaseAuth } from "@/lib/firebase"
import { signInWithEmailAndPassword } from "firebase/auth"
import { AuthOptions } from "next-auth"

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        
        try {
          const userCredential = await signInWithEmailAndPassword(
            firebaseAuth,
            credentials.email,
            credentials.password
          )
          
          const user = userCredential.user
          
          if (user) {
            return {
              id: user.uid,
              email: user.email || '',  // Ensure non-null string
              name: user.displayName || user.email?.split('@')[0] || '',  // Provide fallback
              image: user.photoURL || '',  // Ensure non-null string
            }
          }
          return null
        } catch (error) {
          console.error("Auth error:", error)
          return null
        }
      }
    })
  ],
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id
        token.email = user.email
      }
      return token
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
      }
      return session
    }
  },
  debug: process.env.NODE_ENV === 'development',
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }

