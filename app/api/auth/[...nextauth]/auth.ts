import GoogleProvider from 'next-auth/providers/google';
import { FirestoreAdapter } from '@next-auth/firebase-adapter';
import { adminDb } from '@/lib/firebase-admin';
import type { NextAuthOptions } from 'next-auth';
import type { Session } from 'next-auth';
import type { User } from 'next-auth';

const AUTHORIZED_EMAILS = ['issadeenabdiali@gmail.com']; // Add your test users here

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      }
    }),
  ],
  adapter: FirestoreAdapter(adminDb),
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === 'google') {
        return AUTHORIZED_EMAILS.includes(profile?.email ?? '');
      }
      return false;
    },
    async session({ session, user }: { session: Session; user: User }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  pages: {
    error: '/auth/error', // Add this page to handle auth errors
  }
};