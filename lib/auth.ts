import { NextAuthOptions, User, Account, Profile, Session, getServerSession } from "next-auth" // Import necessary types
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
    workId?: string; // Explicitly store workId for direct verification
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
        password: { label: "Password", type: "password" },
        cookies: { label: "Cookies", type: "text" }, // Allow cookies to be passed
        userData: { label: "User Data", type: "text" } // Add this to allow user data to be passed
      },
      async authorize(credentials, req): Promise<User | null> { // Add req parameter
        if (!credentials?.email || !credentials?.password) {
          console.log("[Auth] Missing credentials");
          throw new Error("Missing credentials");
        }

        try {
          // Check if this is a token-based authentication request (from our secure login flow)
          if (credentials.email === "token_auth" && credentials.password === "token_auth") {
            // For token auth, we just need to create a session
            // The actual authentication happened in the /api/login endpoint
            console.log("[Auth] Token-based authentication");
            
            // First check if we have user data passed directly
            if (credentials.userData) {
              try {
                const userData = JSON.parse(credentials.userData);
                console.log("[Auth] Using user data from credentials:", userData.email);
                
                // Return the user object from the parsed data
                return {
                  id: userData.workId || userData.id,
                  name: userData.name || userData.email?.split('@')[0] || "User",
                  email: userData.email,
                  image: userData.picture || userData.image || null
                };
              } catch (parseError) {
                console.error("[Auth] Error parsing user data:", parseError);
              }
            }
            
            try {
              // Attempt to get the user from the session cookie using cookies from the client
              if (credentials.cookies) {
                console.log("[Auth] Trying to extract from cookies passed from client");
                
                // Create a mock request with cookies
                const mockReq = {
                  cookies: { 'session-token': '' },
                  headers: { cookie: credentials.cookies }
                };
                
                const { getSession } = await import('./session');
                const sessionData = await getSession(mockReq);
                
                if (sessionData && typeof sessionData.email === 'string') {
                  console.log("[Auth] Found user in session from client cookies:", sessionData.email);
                  return {
                    id: typeof sessionData.workId === 'string' ? sessionData.workId : "authenticated",
                    name: typeof sessionData.name === 'string' ? sessionData.name : sessionData.email.split('@')[0],
                    email: sessionData.email,
                    image: typeof sessionData.picture === 'string' ? sessionData.picture : null
                  };
                }
              }
              
              // If we can't get the user from the session, try to use Firebase Admin
              // to find a recently authenticated user with this email
              console.log("[Auth] Attempting to find user from recent logins");
              
              // For now, just return a placeholder - the JWT callback will fix this
              return {
                id: "authenticated",
                name: "Authenticated User",
                email: "authenticated@example.com",
              };
            } catch (error) {
              console.error("[Auth] Error in token auth:", error);
              // Still return a user to allow login, but JWT callback will need to fix
              return {
                id: "authenticated",
                name: "Authenticated User",
                email: "authenticated@example.com",
              };
            }
          }

          // Regular email/password authentication (legacy flow)
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
        // Make sure to include the workId as token.id
        token.id = user.id; // user.id comes from authorize return (mapped from workId)
        
        // Explicitly add workId for direct verification
        token.workId = user.id; 
        
        // If user.id doesn't seem to be a valid workId format, try to fetch from database
        if (user.id === "authenticated-user" || user.id === "authenticated") {
          console.log("[JWT] Generic user detected, trying to fix workId");
          
          // Check if we have cookies to read the next-auth.user-token
          try {
            // Import cookies helper
            const { cookies } = await import('next/headers');
            const cookiesInstance = await cookies();
            const userTokenCookie = cookiesInstance.get('next-auth.user-token');
            
            if (userTokenCookie) {
              try {
                // Parse the user token
                const userData = JSON.parse(userTokenCookie.value);
                console.log("[JWT] Found user token cookie for:", userData.email);
                
                // Update token with user data
                token.id = userData.workId || userData.id;
                token.workId = userData.workId || userData.id;
                token.email = userData.email;
                token.name = userData.name;
                token.picture = userData.image || userData.picture;
                
                // Skip further lookups since we have all the data we need
                return token;
              } catch (parseError) {
                console.error("[JWT] Error parsing user token cookie:", parseError);
              }
            }
          } catch (cookieError) {
            console.error("[JWT] Error accessing cookies:", cookieError);
          }
          
          // Fallback: Try to find user data from recent logins
          try {
            // For token-based auth, we need to look up the workId in the database
            const adminDb = getFirebaseAdminDb();
            const recentLoginsRef = adminDb.ref('recent_logins');
            
            // Look for recent login in admin DB
            console.log("[JWT] Checking recent logins for token auth user");
            
            const recentSnapshot = await recentLoginsRef
              .orderByChild('timestamp')
              .limitToLast(1)
              .once('value');
            
            if (recentSnapshot.exists()) {
              recentSnapshot.forEach((childSnapshot) => {
                const loginData = childSnapshot.val();
                if (loginData.email) {
                  console.log(`[JWT] Found recent login for: ${loginData.email}`);
                  
                  // Update token with the recent login data
                  token.email = loginData.email;
                  
                  if (loginData.workId) {
                    token.workId = loginData.workId;
                    token.id = loginData.workId;
                  }
                  
                  token.name = loginData.name || loginData.email.split('@')[0];
                  token.picture = loginData.picture || null;
                }
                return true; // Break the loop
              });
            }
          } catch (dbError) {
            console.error("[JWT] Error checking recent logins:", dbError);
          }
        }
        
        token.email = user.email; // Ensure email is in the token
        token.name = user.name;
        token.picture = user.image;
      } else if (!token.workId && token.id) {
        // Ensure workId is always set if we have an id
        token.workId = token.id;
      } else if (token.sub && !token.workId) {
        // Use subject claim as workId if needed
        token.workId = token.sub;
      }
      
      // If token.workId is still not set but we have an email, try to fetch from database
      if (!token.workId && token.email) {
        try {
          // Look up workId in the database using email
          const adminDb = getFirebaseAdminDb();
          const usersRef = adminDb.ref('users');
          
          // Find the user record by email
          const userSnapshot = await usersRef
            .orderByChild('email')
            .equalTo(token.email.toLowerCase())
            .once('value');
          
          // Extract the workId if available
          if (userSnapshot.exists()) {
            userSnapshot.forEach((childSnapshot) => {
              const userData = childSnapshot.val();
              if (userData.workId) {
                token.workId = userData.workId;
                token.id = userData.workId;
                console.log(`[JWT] Found workId for ${token.email}: ${userData.workId}`);
              }
              return true; // Break the loop
            });
          }
        } catch (error) {
          console.error("[JWT] Error fetching workId from database:", error);
        }
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
          
          // IMPORTANT: We need email for workId verification
          // This is secure as it's only used server-side or in our secure hooks
          session.user.email = token.email || undefined;
          
          // For API routes, we'll use getToken() to access the ID server-side
          
          if (token.error) {
            session.error = token.error as string;
          }
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