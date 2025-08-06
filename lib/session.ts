import { jwtVerify, SignJWT } from 'jose'
import { nanoid } from 'nanoid'
import { NextRequest, NextResponse } from 'next/server'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

interface SessionData extends Record<string, unknown> {
  id: string
  email: string
  // Add any other session data you want to store
}

export async function getSession(req: NextRequest | any): Promise<SessionData | null> {
  // Handle both NextRequest and regular request objects
  let token: string | undefined;
  
  if ('cookies' in req && typeof req.cookies.get === 'function') {
    // NextRequest object
    token = req.cookies.get('session-token')?.value;
  } else if (req.cookies && typeof req.cookies === 'object') {
    // Regular request object with cookies object
    token = req.cookies['session-token'];
  } else if (req.headers && req.headers.cookie) {
    // Request with cookie header
    const cookies = req.headers.cookie.split(';').reduce((acc: Record<string, string>, cookie: string) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {});
    token = cookies['session-token'];
  }

  if (!token) return null;

  try {
    const verified = await jwtVerify(token, new TextEncoder().encode(JWT_SECRET))
    return verified.payload as unknown as SessionData
  } catch (err) {
    return null
  }
}

export async function setSession(res: NextResponse, data: SessionData): Promise<void> {
  const token = await new SignJWT(data)
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(nanoid())
    .setIssuedAt()
    .setExpirationTime('2h') // Set session expiration time
    .sign(new TextEncoder().encode(JWT_SECRET))

  res.cookies.set('session-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7200, // 2 hours in seconds
    path: '/',
  })
}

export async function clearSession(res: NextResponse): Promise<void> {
  res.cookies.set('session-token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  })
}

