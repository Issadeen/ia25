import CredentialsProvider from "next-auth/providers/credentials";
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import type { NextAuthOptions } from 'next-auth';

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
        try {
          console.log('Attempting login with:', credentials?.email);
          const response = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: credentials?.email,
                password: credentials?.password,
                returnSecureToken: true,
              }),
            }
          );

          const data = await response.json();
          console.log('Firebase auth response:', data);

          if (!response.ok) {
            console.error('Authentication failed:', data.error);
            return null;
          }

          const userRecord = await adminAuth.getUser(data.localId);
          console.log('Fetched user record:', userRecord);

          // Optionally, you can use adminDb here if needed
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
  },
  pages: {
    signIn: '/login',
    error: '/auth/error',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.email = user.email ?? undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.uid as string;
        session.user.email = token.email;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
    },
  },
  debug: process.env.NODE_ENV === 'development',
};