import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    
    // Check if token exists and is not expired
    if (!token || (token.exp && Date.now() / 1000 > token.exp)) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ req, token }) => {
        // Require token for all protected routes
        if (
          (req.nextUrl.pathname.startsWith("/dashboard") ||
           req.nextUrl.pathname.startsWith("/api/protected")) &&
          (!token || (token.exp && Date.now() / 1000 > token.exp))
        ) {
          return false;
        }
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/protected/:path*",
    // Add all protected routes here
  ],
};