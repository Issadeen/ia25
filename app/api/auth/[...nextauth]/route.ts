import NextAuth from 'next-auth';
import { authOptions } from './auth';

export const dynamic = 'force-dynamic';

async function handler(req: Request, res: Response) {
  // Handle CORS
  const origin = req.headers.get('origin');
  if (origin) {
    res.headers.set('Access-Control-Allow-Origin', origin);
    res.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return NextAuth(authOptions)(req, res);
}

export { handler as GET, handler as POST };

