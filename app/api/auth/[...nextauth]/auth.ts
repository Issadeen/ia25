import CredentialsProvider from "next-auth/providers/credentials";
import { FirestoreAdapter } from '@next-auth/firebase-adapter';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import type { NextAuthOptions } from 'next-auth';
import type { User } from 'next-auth';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Missing credentials');
        }

        try {
          // Sign in the user using Firebase Authentication REST API
          const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
              returnSecureToken: true,
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error.message || 'Failed to authenticate');
          }

          const idToken = data.idToken;

          // Verify the ID token with Firebase Admin SDK
          const decodedToken = await adminAuth.verifyIdToken(idToken);
          const userRecord = await adminAuth.getUser(decodedToken.uid);

          return {
            id: userRecord.uid,
            email: userRecord.email,
            name: userRecord.displayName || userRecord.email?.split('@')[0],
          };
        } catch (error: unknown) {
          console.error('Auth error:', error);
          return null;
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
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
      }
      return session;
    },
  },
};