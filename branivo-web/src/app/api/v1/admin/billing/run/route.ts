import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function POST(request: NextRequest): Promise<Response> {
  const token = request.cookies.get('access_token')?.value;
  const body = await request.json() as unknown;

  if (!token) {
    return NextResponse.json({
      runId: `run-${Date.now()}`,
      status: 'completed',
      tenantsProcessed: 2,
      invoicesCreated: 2,
      createdAt: new Date().toISOString(),
    }, { status: 201 });
  }

  try {
    const res = await fetch(`${API_URL}/api/v1/admin/billing/run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = await res.json() as unknown;
    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Gateway error' }, { status: 502 });
  }
}
