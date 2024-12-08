import CredentialsProvider from "next-auth/providers/credentials";
import { FirestoreAdapter } from '@next-auth/firebase-adapter';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import type { NextAuthOptions } from 'next-auth';

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
          // Get user by email using Admin SDK
          const userRecord = await adminAuth.getUserByEmail(credentials.email);
          
          // Verify the password with Admin SDK
          await adminAuth.verifyIdToken(credentials.password)
            .catch(() => {
              throw new Error('Invalid password');
            });

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