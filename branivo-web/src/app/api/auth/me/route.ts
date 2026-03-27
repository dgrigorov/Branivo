import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const segment = token.split('.')[1];
    if (!segment) return null;
    const decoded = Buffer.from(segment, 'base64url').toString('utf-8');
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;

  if (!token) {
    return NextResponse.json({ role: null }, { status: 200 });
  }

  const payload = decodeJwtPayload(token);
  if (!payload) {
    return NextResponse.json({ role: null }, { status: 200 });
  }

  const role = typeof payload.role === 'string' ? payload.role : null;
  const userId = typeof payload.sub === 'string' ? payload.sub : null;
  const tenantId = typeof payload.tid === 'string' ? payload.tid : null;

  return NextResponse.json({ role, userId, tenantId }, { status: 200 });
}
