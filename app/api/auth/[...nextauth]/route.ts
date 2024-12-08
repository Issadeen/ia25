import NextAuth from 'next-auth';
import { authOptions } from './auth';
import { NextApiRequest, NextApiResponse } from 'next';

export const dynamic = 'force-dynamic';

// Create the handler using NextAuth
const handler = NextAuth(authOptions);

// Export the handler methods
export { handler as GET, handler as POST };

// Add OPTIONS handler for CORS
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
    },
  });
}

