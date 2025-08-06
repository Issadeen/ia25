import { NextAuthOptions, User, Account, Profile, Session } from "next-auth" // Import necessary types
import { AdapterUser } from "next-auth/adapters" // Import AdapterUser
import { JWT } from "next-auth/jwt" // Import JWT type

// Extend the Session interface to include error property and potentially remove email/name if always hidden
declare module "next-auth" {
  interface Session {
    error?: string;
    // Keep user non-optional, but redefine its shape for the client-side session
    user: {
      email: string | undefined;
      // email is intentionally omitted here for client-side safety
      name?: string | null;
      image?: string | null;
      // Add id ONLY if needed client-side (generally avoid)
      // id?: string;
    }
    // Add a server-side only property if needed, though accessing token is better
    // serverSideUser?: { id: string; email: string; name?: string | null; image?: string | null; }
  }
  // Also ensure the JWT token can hold the necessary fields server-side
  interface JWT {
    id?: string; // Corresponds to FirebaseUser workId
    email?: string | null; // Ensure email is part of JWT
    // name?: string | null; // Already part of default JWT
    // picture?: string | null; // Already part of default JWT
  }
}

import CredentialsProvider from "next-auth/providers/credentials"
// Client SDK imports - kept for reference but replaced with Admin SDK in authorize
import { getDatabase as getClientDatabase, ref as clientRef, get } from "firebase/database"
import { app } from "./firebase"
// Admin SDK imports
import { getFirebaseAdminDb } from './firebase-admin';
import admin from 'firebase-admin';

import GoogleProvider from 'next-auth/providers/google';
import bcrypt from 'bcrypt';

interface FirebaseUser {
  email: string;
  password: string; // Hashed password
  workId: string;
  name?: string;
  image?: string;
}

const saltRounds = 10; // Ensure this matches the registration salt rounds

// Helper function to check if a string looks like a bcrypt hash
const isBcryptHash = (str: string): boolean => {
  // Basic check: Bcrypt hashes usually start with $2a$, $2b$, or $2y$ followed by $ and cost factor
  return typeof str === 'string' && str.length === 60 && str.startsWith('$2');
};

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  debug: true, // Keep debug enabled for detailed logs
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials): Promise<User | null> { // Add return type hint
        if (!credentials?.email || !credentials?.password) {
          console.log("[Auth] Missing credentials");
          throw new Error("Missing credentials");
        }

        try {
          // Use Admin SDK instead of client SDK to bypass Firebase rules
          const adminDatabase = getFirebaseAdminDb();
          const usersRef = adminDatabase.ref('users');

          console.log("[Auth] Attempting to authenticate:", credentials.email);

          // Query specifically for the user with this email using Admin SDK
          const snapshot = await usersRef
            .orderByChild('email')
            .equalTo(credentials.email.toLowerCase())
            .once('value');

          if (!snapshot.exists()) {
            console.log("[Auth] No user found with email:", credentials.email);
            throw new Error("No user found with this email.");
          }

          // Process the user data from the snapshot
          let userId: string | null = null;
          let userData: any = null;

          snapshot.forEach((childSnapshot) => {
            userId = childSnapshot.key;
            userData = childSnapshot.val();
            return true; // Break the forEach loop
          });

          if (!userData || !userId) {
            console.log("[Auth] User data could not be processed");
            throw new Error("Authentication failed");
          }

          // Create a properly typed user object
          const user: FirebaseUser = {
            email: userData.email,
            password: userData.password,
            workId: userData.workId,
            name: userData.name,
            image: userData.image
          };

          const storedPassword = user.password;
          const providedPassword = credentials.password;

          console.log("[Auth] Found user:", {
            email: user.email,
            workId: user.workId,
          });

          let passwordMatch = false;
          let isPlainTextPassword = false;

          // Check if the stored password looks like a hash
          if (isBcryptHash(storedPassword)) {
            console.log(`[Auth] Comparing hashed password for user: ${user.email}`);
            passwordMatch = await bcrypt.compare(providedPassword, storedPassword);
          } else {
            // Assume plain text comparison is needed
            console.log(`[Auth] Comparing plain text password for user: ${user.email}`);
            passwordMatch = storedPassword === providedPassword;
            if (passwordMatch) {
              isPlainTextPassword = true;
            }
          }

          if (!passwordMatch) {
            console.log(`[Auth] Invalid password for user: ${user.email}`);
            throw new Error("Invalid password.");
          }

          // If plain text password matched, hash it and update using ADMIN SDK
          if (isPlainTextPassword) {
            console.log(`[Auth] User ${user.email} logged in with plain text password. Updating to hash using Admin SDK.`);
            try {
              const hashedPassword = await bcrypt.hash(providedPassword, saltRounds);
              await usersRef.child(userId).update({ password: hashedPassword });
              console.log(`[Auth] Password for user ${user.email} successfully updated to hash.`);
            } catch (updateError) {
              console.error(`[Auth] Failed to update password hash for user ${user.email} using Admin SDK:`, updateError);
              // Log the error but allow login to proceed
            }
          }

          console.log("[Auth] Authentication successful for:", user.email);
          console.log("[Auth] User workId:", user.workId);
          
          // Password is correct
          const authUser = {
            id: user.workId, // Map workId to id for next-auth User object
            email: user.email,
            name: user.name || user.email, // Provide a fallback name
            image: user.image || null
          };
          
          console.log("[Auth] Returning auth user with id:", authUser.id);
          return authUser;
        } catch (error) {
          console.error('[Auth] Error in authorize function:', error); // Log specific error
          if (error instanceof Error) {
            throw error; // Re-throw specific errors
          }
          throw new Error("Authentication failed."); // Generic error
        }
      }
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 60, // 30 minutes
  },
  pages: {
    signIn: '/login',
    error: '/login', // Redirect to login page on error
  },
  callbacks: {
    async jwt({ token, user, account }: { token: JWT; user?: User | AdapterUser; account?: Account | null }): Promise<JWT> {
      // This runs *before* the session callback
      // Persist the necessary user info to the token right after sign-in
      if (user) {
        // Make sure to include the workId as token.id
        token.id = user.id; // user.id comes from authorize return (mapped from workId)
        token.email = user.email; // Ensure email is in the token
        token.name = user.name;
        token.picture = user.image;
        
        // Log token creation to verify workId is set
        console.log("[Auth JWT] Created token with ID:", token.id);
      }
      return token; // The token is encrypted and stored in the session cookie
    },
    async session({ session, token }: { session: Session; token: JWT }): Promise<Session> {
      // This runs *after* the jwt callback, using the token data
      try {
        if (token && session.user) {
          // Assign properties defined in the Session['user'] type for the client
          session.user.name = token.name;
          session.user.image = token.picture;
          
          // Important: If there's an issue with workId, enable this:
          // This makes the ID available client-side but increases attack surface
          // session.user.id = token.id; 
          
          // For API routes, we'll use getToken() to access the ID server-side
          
          // DO NOT add email here - keep it out of the client-side session
          // session.user.email = token.email;

          if (token.error) {
            session.error = token.error as string;
          }
          
          console.log("[Auth Session] Session created with token ID:", token.id);
        }
        return session;
      } catch (error) {
        console.error("[Auth Callback] Error in Session callback:", error);
        return { ...session, error: "SessionCallbackError", user: {
          email: undefined
        } }; // Clear user on error
      }
    }
  },
  logger: {
    error(code, ...message) {
      console.error("[NextAuth Logger Error]", code, message);
    },
    warn(code, ...message) {
      console.warn("[NextAuth Logger Warn]", code, message);
    },
    debug(code, ...message) {
      // console.debug("[NextAuth Logger Debug]", code, message); // Usually too verbose
    },
  },
};