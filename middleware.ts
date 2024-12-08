import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Allow auth endpoints to pass through
  if (request.nextUrl.pathname.startsWith('/api/auth')) {
    const response = NextResponse.next();
    // Add CORS headers for auth endpoints
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET,DELETE,PATCH,POST,PUT');
    response.headers.set('Access-Control-Allow-Headers', 'Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date');
    return response;
  }

  // Root redirect
  if (request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const response = NextResponse.next();
  
  // Add CORS headers for all responses
  const origin = request.headers.get('origin');
  const allowedOrigins = [
    'https://ia25.vercel.app',
    'http://localhost:3000',
    process.env.NEXTAUTH_URL,
  ].filter(Boolean);

  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', '*');
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};