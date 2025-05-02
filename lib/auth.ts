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
      name?: string | null;
      image?: string | null;
      // id and email are intentionally omitted as they are not sent to the client
    }
  }
  // Also ensure the JWT token can hold the necessary fields server-side
  interface JWT {
    id?: string;
    // email?: string | null; // Already part of default JWT
    // name?: string | null; // Already part of default JWT
    // picture?: string | null; // Already part of default JWT
  }
}

import CredentialsProvider from "next-auth/providers/credentials"
// Client SDK imports
import { getDatabase as getClientDatabase, ref as clientRef, get } from "firebase/database"
import { app } from "./firebase"
// Admin SDK imports
import { getFirebaseAdminDb } from './firebase-admin';
// No direct imports needed from 'firebase-admin/database' for ref/update

import GoogleProvider from 'next-auth/providers/google';
import bcrypt from 'bcrypt';

interface FirebaseUser {
  email: string;
  password: string;
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
        console.log("[Auth] Authorize function started."); // Add entry log
        if (!credentials?.email || !credentials?.password) {
          console.log("[Auth] Missing credentials");
          return null;
        }

        try {
          // Use Client SDK for initial read (assuming read rules allow it)
          const clientDatabase = getClientDatabase(app);
          const usersRef = clientRef(clientDatabase, 'users');

          console.log("[Auth] Attempting to authenticate:", credentials.email);

          const snapshot = await get(usersRef);

          if (!snapshot.exists()) {
            console.log("[Auth] No users found in database");
            return null;
          }

          const users = snapshot.val() as Record<string, FirebaseUser>;
          // console.log("[Auth] Database users:", users); // Optional: uncomment if needed

          const userEntry = Object.entries(users).find(
            ([, u]) => u.email.toLowerCase() === credentials.email.toLowerCase()
          );

          if (!userEntry) {
            console.log("[Auth] User not found:", credentials.email);
            return null;
          }

          const [userId, user] = userEntry; // Get the user ID (workId) and user data
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
            return null;
          }

          // If plain text password matched, hash it and update using ADMIN SDK
          if (isPlainTextPassword) {
            console.log(`[Auth] User ${user.email} logged in with plain text password. Updating to hash using Admin SDK.`);
            try {
              const hashedPassword = await bcrypt.hash(providedPassword, saltRounds);
              const adminDatabase = getFirebaseAdminDb();
              const userRefToUpdate = adminDatabase.ref(`users/${userId}`);
              await userRefToUpdate.update({ password: hashedPassword });
              console.log(`[Auth] Password for user ${user.email} successfully updated to hash.`);
            } catch (updateError) {
              console.error(`[Auth] Failed to update password hash for user ${user.email} using Admin SDK:`, updateError);
              // Log the error but allow login to proceed
            }
          }

          console.log("[Auth] Authentication successful for:", user.email);
          // Password is correct
          return {
            id: user.workId,
            email: user.email,
            name: user.name || user.email, // Provide a fallback name
            image: user.image || null
          };
        } catch (error) {
          console.error('[Auth] Error in authorize function:', error); // Log specific error
          return null; // Ensure null is returned on error
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
    error: '/login', // Or a dedicated error page: '/auth/error'
  },
  callbacks: {
    async jwt({ token, user, account }: { token: JWT; user?: User | AdapterUser; account?: Account | null }): Promise<JWT> {
      try {
        // Persist the necessary user info from the User object to the token
        if (user) {
          token.id = user.id; // Keep id server-side in the token
          // email, name, picture are usually added by default if available in user object
        }
        // Add logic for OAuth providers if necessary
        // if (account?.provider === "google" && profile) { ... }
        return token;
      } catch (error) {
        console.error("[Auth Callback] Error in JWT callback:", error);
        // Return token potentially modified to indicate error, or original token
        return { ...token, error: "JwtCallbackError" };
      }
    },
    async session({ session, token }: { session: Session; token: JWT }): Promise<Session> {
      try {
        // Only add properties to session.user that you want exposed client-side
        if (token && session.user) {
          // Assign only the properties defined in the augmented Session['user'] type
          session.user.name = token.name;
          session.user.image = token.picture;

          if (token.error) {
            session.error = token.error as string;
          }
        } else if (session.user) {
           // If token is somehow missing but session.user exists, clear sensitive fields
           // delete session.user.email; // Not needed if email is already excluded by type
           // delete session.user.id; // Not needed if id is already excluded by type
        }
        return session; // Return the modified session object
      } catch (error) {
        console.error("[Auth Callback] Error in Session callback:", error);
        // Return session potentially modified to indicate error
        return { ...session, error: "SessionCallbackError" };
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