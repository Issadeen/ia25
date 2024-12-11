import { AuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { getFirebaseAuth } from "@/lib/firebase"
import { signInWithEmailAndPassword } from "firebase/auth"

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) return null
          
          const auth = getFirebaseAuth();
          if (!auth) throw new Error('Firebase auth not initialized');

          const { user } = await signInWithEmailAndPassword(
            auth,
            credentials.email,
            credentials.password
          )

          if (!user.email) {
            throw new Error('No email associated with user');
          }

          return {
            id: user.uid,
            email: user.email, // This is now guaranteed to be string
            name: user.displayName || user.email, // Fallback to email if no display name
            image: user.photoURL || null,
          }

        } catch (error) {
          console.error('Auth error:', error)
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
    maxAge: 24 * 60 * 60,
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