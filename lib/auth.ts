import { NextAuthOptions, Session } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import axios from 'axios';
import { JWT } from "next-auth/jwt"

// Add these type declarations at the top of the file
declare module "next-auth" {
  interface Session {
    user: {
      id?: string | null;    // Modified this line
      name?: string | null;
      email?: string | null;
      image?: string | null;
    }
    accessToken?: string;
    idToken?: string;
    firebaseToken?: string;  // Add this line
    exp?: number; // Add this line
  }

  interface User {
    id: string;
    refreshToken?: string;  // Add this line
    idToken?: string;       // Add this line
    email?: string | null;
    firebaseToken?: string;  // Add this line
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    email?: string;
    accessToken?: string;
    idToken?: string;
    exp?: number; // Add this line
  }
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Please enter an email and password");
        }

        try {
          const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
          console.log("Using API Key:", apiKey); // Debug log

          if (!apiKey) {
            throw new Error("Firebase API key is not configured");
          }

          const response = await axios.post(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
            {
              email: credentials.email,
              password: credentials.password,
              returnSecureToken: true,
            },
            {
              headers: {
                'Content-Type': 'application/json',
              }
            }
          );

          const userData = response.data;
          console.log("Firebase auth response:", userData); // Debug log
          console.log("Firebase token received:", userData.idToken); // Debug log

          if (!userData.localId) {
            throw new Error("Invalid response from Firebase");
          }

          // Return the user object along with tokens
          return {
            id: userData.localId,
            email: userData.email,
            name: userData.displayName || null,
            image: userData.photoUrl || null,
            idToken: userData.idToken,            // Add this line
            refreshToken: userData.refreshToken,  // Add this line
            firebaseToken: userData.idToken  // Store the Firebase token
          };
        } catch (error: any) {
          console.error("Firebase auth error details:", {
            response: error.response?.data,
            status: error.response?.status,
            headers: error.response?.headers,
          });
          
          if (error.response?.data?.error?.message) {
            throw new Error(error.response.data.error.message);
          }
          throw new Error("Authentication failed");
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 60 * 30, // 30 minutes
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, user, account }) {
      // For initial sign in
      console.log("JWT Callback - User:", user); // Debug log
      console.log("JWT Callback - Account:", account); // Debug log

      if (user) {
        token.id = user.id;
        token.email = user.email ?? undefined;
        token.accessToken = user.refreshToken; // Use refreshToken as accessToken
        token.idToken = user.idToken;
        token.firebaseToken = user.firebaseToken;
        token.exp = Math.floor(Date.now() / 1000) + 60 * 30; // 30 minutes
        console.log('JWT callback - Set tokens from CredentialsProvider'); // Debug log
      }
      // If tokens are available from account (e.g., GoogleProvider)
      if (account) {
        token.accessToken = account.access_token || token.accessToken;
        token.idToken = account.id_token || token.idToken;
        token.firebaseToken = account.id_token;
        console.log('JWT callback - Set tokens from account'); // Debug log
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
      }
      session.accessToken = token.accessToken as string;
      session.idToken = token.idToken as string | undefined;
      session.firebaseToken = token.firebaseToken as string;
      session.exp = token.exp as number;
      console.log('Session callback - Access Token:', session.accessToken); // Debug log
      console.log('Session callback - ID Token:', session.idToken); // Debug log
      console.log("Session Callback - Final Session:", session); // Debug log
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // Allows callback URLs on the same origin
      else if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
    signOut: '/login',
  },
  debug: true,
  events: {
    async signOut({ token }) {
      // Clear any server-side session data
    },
  },
};