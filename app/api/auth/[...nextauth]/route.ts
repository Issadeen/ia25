import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// Remove or modify dynamic export
// export const dynamic = "force-dynamic" // Remove this line

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

