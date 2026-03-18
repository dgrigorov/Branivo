import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function POST(request: NextRequest) {
  const body = await request.json() as unknown;
  const host = request.headers.get('host') ?? '';

  const apiRes = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Host: host,
    },
    body: JSON.stringify(body),
  });

  const data = await apiRes.json() as unknown;

  const res = NextResponse.json(data, { status: apiRes.status });

  // Set httpOnly cookies on successful full login (no 2FA required)
  const responseData = data as {
    access_token?: string;
    refresh_token?: string;
    requires_2fa?: boolean;
  };
  if (apiRes.ok && responseData.access_token && !responseData.requires_2fa) {
    res.cookies.set('access_token', responseData.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 900,
      path: '/',
    });
    if (responseData.refresh_token) {
      res.cookies.set('refresh_token', responseData.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
      });
    }
  }

  return res;
}
