import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { NextRequest } from 'next/server';

interface AppToken {
  id?: string;
  email?: string;
  // Include other properties if they exist in your token
}

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET }) as AppToken | null;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Return only the necessary info (e.g., email or id)
  return NextResponse.json({
    email: token.email,
    id: token.id
    // Add other fields if needed client-side, but be cautious
  });
}
