import { withAuth } from "next-auth/middleware"

export default withAuth({
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized: ({ token }) => !!token
  },
})

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - login
     * - api/auth (authentication API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)',
  ]
}

