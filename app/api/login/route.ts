import { NextRequest, NextResponse } from 'next/server'
import { setSession } from '@/lib/session'

export async function POST(req: NextRequest) {
  const { email, uid } = await req.json()

  if (!email || !uid) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const res = NextResponse.json({ success: true })

  await setSession(res, { id: uid, email })

  return res
}

