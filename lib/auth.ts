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
          // Use Client SDK for initial read (assuming read rules allow it)
          const clientDatabase = getClientDatabase(app);
          const usersRef = clientRef(clientDatabase, 'users');

          console.log("[Auth] Attempting to authenticate:", credentials.email);

          const snapshot = await get(usersRef);

          if (!snapshot.exists()) {
            console.log("[Auth] No users found in database");
            throw new Error("No user found with this email.");
          }

          const users = snapshot.val() as Record<string, FirebaseUser>;
          const userEntry = Object.entries(users).find(
            ([, u]) => u.email.toLowerCase() === credentials.email.toLowerCase()
          );

          if (!userEntry) {
            console.log("[Auth] User not found:", credentials.email);
            throw new Error("No user found with this email.");
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
            throw new Error("Invalid password.");
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
            id: user.workId, // Map workId to id for next-auth User object
            email: user.email,
            name: user.name || user.email, // Provide a fallback name
            image: user.image || null
          };
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
        token.id = user.id; // user.id comes from authorize return (mapped from workId)
        token.email = user.email; // Ensure email is in the token
        token.name = user.name;
        token.picture = user.image;
      }
      return token; // The token is encrypted and stored in the session cookie
    },
    async session({ session, token }: { session: Session; token: JWT }): Promise<Session> {
      // This runs *after* the jwt callback, using the token data
      // Only expose *non-sensitive* data to the client-side session object
      try {
        if (token && session.user) {
          // Assign only the properties defined in the augmented Session['user'] type for the client
          session.user.name = token.name;
          session.user.image = token.picture;
          // session.user.id = token.id; // Add this ONLY if client-side ID is absolutely necessary

          // DO NOT add email here: session.user.email = token.email;
          // This keeps the email out of the client-side session object

          if (token.error) {
            session.error = token.error as string;
          }
        }
        // Note: Server-side calls to getServerSession will also receive this pruned session object.
        // Accessing the token directly (like in the api/user-info route) is needed for sensitive data server-side.
        return session; // Return the modified session object intended for the client
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