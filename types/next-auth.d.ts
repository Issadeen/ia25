import { DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user: {
      /** The user's email address. */
      email?: string | null;
      // You can add other custom properties here if needed, like id or role
      // id?: string;
    } & DefaultSession["user"]; // Keep the default properties like name and image
  }

  // If you also need 'email' on the User object returned by the adapter/callbacks
  // interface User extends DefaultUser {
  //   email?: string | null;
  // }
}

// If you are using JWT strategy, you might need to augment the JWT type too
// declare module "next-auth/jwt" {
//   interface JWT {
//     email?: string | null;
//     // id?: string;
//   }
// }