import CredentialsProvider from "next-auth/providers/credentials";
import { FirestoreAdapter } from '@next-auth/firebase-adapter';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import type { NextAuthOptions } from 'next-auth';
import type { User } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        try {
          console.log('Attempting authentication with credentials:', credentials?.email);
          
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
          console.log('Firebase response status:', response.status);

          if (!response.ok) {
            console.error('Firebase auth error:', data.error);
            return null;
          }

          const userRecord = await adminAuth.getUser(data.localId);
          
          const user = {
            id: userRecord.uid,
            email: userRecord.email,
            name: userRecord.displayName || userRecord.email?.split('@')[0],
            image: userRecord.photoURL,
          };
          
          console.log('Authentication successful:', user);
          return user;
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
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        // Ensure email is string or undefined, not null
        token.email = user.email || undefined;
      }
      console.log('JWT callback:', { token });
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        // Ensure email is string or undefined, not null
        session.user.email = token.email || undefined;
      }
      console.log('Session callback:', { session });
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Handle production and development URLs
      if (url.startsWith(baseUrl)) return url;
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      return baseUrl;
    },
  },
  logger: {
    error(code, ...message) {
      console.error(code, message);
    },
    warn(code, ...message) {
      console.warn(code, message);
    },
    debug(code, ...message) {
      console.debug(code, message);
    },
  },
};