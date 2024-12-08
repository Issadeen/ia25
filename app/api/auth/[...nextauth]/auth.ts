import CredentialsProvider from "next-auth/providers/credentials";
import { FirestoreAdapter } from '@next-auth/firebase-adapter';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import type { NextAuthOptions } from 'next-auth';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: 'credentials',
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
            const error = data.error?.message || 'Invalid credentials';
            console.error('Firebase auth error:', error);
            throw new Error(error);
          }

          const userRecord = await adminAuth.getUser(data.localId);
          return {
            id: userRecord.uid,
            email: userRecord.email || '',
            name: userRecord.displayName || userRecord.email?.split('@')[0] || '',
          };
        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
      }
    })
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60,
    secret: process.env.NEXTAUTH_SECRET,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.email = user.email ?? '';
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.uid as string;
        session.user.email = token.email;
      }
      return session;
    }
  },
  pages: {
    signIn: '/login',
    error: '/auth/error',
  },
  debug: true,
};