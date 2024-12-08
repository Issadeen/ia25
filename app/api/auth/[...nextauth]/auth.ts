import CredentialsProvider from "next-auth/providers/credentials";
import { FirestoreAdapter } from '@next-auth/firebase-adapter';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import type { NextAuthOptions } from 'next-auth';
import type { User } from 'next-auth';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Missing credentials');
        }

        try {
          const response = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: credentials.email,
                password: credentials.password,
                returnSecureToken: true,
              }),
            }
          );

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error?.message || 'Authentication failed');
          }

          const userRecord = await adminAuth.getUser(data.localId);

          return {
            id: userRecord.uid,
            email: userRecord.email,
            name: userRecord.displayName || userRecord.email?.split('@')[0],
            image: userRecord.photoURL,
          };
        } catch (error) {
          console.error('Auth error:', error);
          throw error;
        }
      }
    })
  ],
  adapter: FirestoreAdapter(adminDb),
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
  pages: {
    signIn: '/login', // point to your custom login page
    error: '/auth/error',
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.uid = user.id;
        token.email = user.email ?? undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.email = token.email as string;
      }
      return session;
    },
  },
  // Remove custom cookies configuration
};