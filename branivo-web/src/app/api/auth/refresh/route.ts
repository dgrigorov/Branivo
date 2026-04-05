import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge,
    path: '/',
  };
}

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get('refresh_token')?.value;
  if (!refreshToken) {
    return NextResponse.json({ message: 'No refresh token' }, { status: 401 });
  }

  try {
    const apiRes = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!apiRes.ok) {
      return NextResponse.json({ message: 'Token refresh failed' }, { status: 401 });
    }

    const data = (await apiRes.json()) as {
      access_token: string;
      refresh_token: string;
    };

    const res = NextResponse.json({ ok: true });
    res.cookies.set('access_token', data.access_token, cookieOpts(900));
    res.cookies.set('refresh_token', data.refresh_token, cookieOpts(60 * 60 * 24 * 30));
    return res;
  } catch {
    return NextResponse.json({ message: 'Refresh service unavailable' }, { status: 503 });
  }
}
