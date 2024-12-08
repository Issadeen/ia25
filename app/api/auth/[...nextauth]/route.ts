import NextAuth from 'next-auth';
import { authOptions } from './auth';
import { NextApiRequest, NextApiResponse } from 'next';

export const dynamic = 'force-dynamic';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
}

