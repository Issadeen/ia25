import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { getDatabase, ref, get } from "firebase/database"
import { app } from "./firebase"
import GoogleProvider from 'next-auth/providers/google';

interface FirebaseUser {
  email: string;
  password: string;
  workId: string;
  name?: string;
  image?: string;
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  debug: true,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          console.log("Missing credentials");
          return null;
        }

        try {
          const database = getDatabase(app);
          const usersRef = ref(database, 'users');
          
          console.log("Attempting to authenticate:", credentials.email);
          
          const snapshot = await get(usersRef);
          
          if (!snapshot.exists()) {
            console.log("No users found in database");
            return null;
          }

          const users = snapshot.val() as Record<string, FirebaseUser>;
          console.log("Database users:", users); // Debug log

          const user = Object.values(users).find(
            (u) => u.email.toLowerCase() === credentials.email.toLowerCase()
          );

          if (!user) {
            console.log("User not found:", credentials.email);
            return null;
          }

          // Debug log the actual values
          console.log("Found user:", {
            email: user.email,
            workId: user.workId,
            storedPassword: user.password,
            providedPassword: credentials.password
          });

          if (user.password !== credentials.password) {
            console.log("Invalid password");
            return null;
          }

          return {
            id: user.workId,
            email: user.email,
            name: user.name || null,
            image: user.image || null
          };
        } catch (error) {
          console.error('Auth error:', error);
          return null;
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
    error: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        // Debug: Log token creation
        console.log("Creating JWT token for user:", user.email);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        // Debug: Log session creation
        console.log("Creating session for user:", session.user.email);
      }
      return session;
    }
  },
  logger: {
    error(code, ...message) {
      console.error(code, message)
    },
    warn(code, ...message) {
      console.warn(code, message)
    },
    debug(code, ...message) {
      console.debug(code, message)
    },
  },
};