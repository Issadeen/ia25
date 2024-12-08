import CredentialsProvider from "next-auth/providers/credentials";
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import type { NextAuthOptions } from 'next-auth';

// Add these type definitions
declare module "next-auth" {
  interface User {
    id: string;
    email?: string;
    name?: string;
    firebaseToken?: string;
    accessToken?: string;
  }
  
  interface Session {
    user: User;
    firebaseToken?: string;
    accessToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    email?: string;
    firebaseToken?: string;
    accessToken?: string;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Missing credentials');
        }

        try {
          const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
          if (!apiKey) throw new Error('Missing Firebase API key');

          const response = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
              body: JSON.stringify({
                email: credentials.email,
                password: credentials.password,
                returnSecureToken: true,
              }),
            }
          );

          const data = await response.json();

          if (!response.ok) {
            console.error('Auth Error:', data.error);
            throw new Error(data.error?.message || 'Authentication failed');
          }

          // Get additional user info from Firebase Admin
          const userRecord = await adminAuth.getUser(data.localId);

          // Create a custom token for Firebase client SDK
          const customToken = await adminAuth.createCustomToken(data.localId);

          return {
            id: userRecord.uid,
            email: userRecord.email || '',  // Add null check here
            name: userRecord.displayName || userRecord.email?.split('@')[0] || '',
            firebaseToken: customToken,
            accessToken: data.idToken,
          };
        } catch (error) {
          console.error('Authorization error:', error);
          return null;
        }
      }
    })
  ],
  pages: {
    signIn: '/login',
    error: '/auth/error',
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 60, // 30 minutes
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.email = user.email;
        token.firebaseToken = user.firebaseToken;
        token.accessToken = user.accessToken;
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.uid;
        session.user.email = token.email;
        session.firebaseToken = token.firebaseToken;
        session.accessToken = token.accessToken;
      }
      return session;
    },
  },
  debug: process.env.NODE_ENV === 'development',
};