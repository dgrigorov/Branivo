import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Placeholder: Full tenant resolution (Host header → Redis lookup) implemented in Story 1.2
export function middleware(request: NextRequest): NextResponse {
  const host = request.headers.get('host') ?? 'localhost';
  const tenantSlug = host.split('.')[0] ?? 'default';

  const response = NextResponse.next();
  response.headers.set('x-tenant-slug', tenantSlug);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
