import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function POST(request: NextRequest) {
  const body = await request.json() as unknown;

  const apiRes = await fetch(`${API_URL}/api/v1/auth/2fa/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await apiRes.json() as unknown;
  const res = NextResponse.json(data, { status: apiRes.status });

  const responseData = data as {
    access_token?: string;
    refresh_token?: string;
  };
  if (apiRes.ok && responseData.access_token) {
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
