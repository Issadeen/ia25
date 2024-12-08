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
          console.log('Missing credentials');
          return null;
        }

        try {
          console.log('Attempting authentication for:', credentials.email);
          
          // Sign in using Firebase Auth REST API
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
          console.log('Firebase Auth Response:', response.status);

          if (!response.ok) {
            console.error('Firebase Auth Error:', data.error);
            return null;
          }

          // Get user details from Firebase Admin
          const userRecord = await adminAuth.getUser(data.localId);
          console.log('User authenticated successfully:', userRecord.uid);

          return {
            id: userRecord.uid,
            email: userRecord.email,
            name: userRecord.displayName || userRecord.email?.split('@')[0],
          };
        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
      }
    })
  ],
  adapter: FirestoreAdapter(adminDb),
  secret: process.env.NEXTAUTH_SECRET,
  debug: true,
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
  cookies: {
    sessionToken: {
      name: `${process.env.NODE_ENV === 'production' ? '__Secure-' : ''}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        domain: process.env.NODE_ENV === 'production' ? '.vercel.app' : undefined
      }
    }
  }
};