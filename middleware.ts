import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const origin = request.headers.get('origin') || '';
  
  // Allow both local development and production URLs
  const allowedOrigins = ['http://localhost:3000', 'https://ia25.vercel.app'];
  
  if (allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET,DELETE,PATCH,POST,PUT,OPTIONS');
    response.headers.set(
      'Access-Control-Allow-Headers',
      'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );
  }

  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};