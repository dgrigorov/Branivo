import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const NOT_FOUND_PATH = '/not-found';

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const host = request.headers.get('host') ?? '';
  const hostname = host.split(':')[0];

  if (!hostname || hostname === 'localhost') {
    return NextResponse.next();
  }

  const apiUrl = process.env.API_INTERNAL_URL ?? '';
  if (!apiUrl) {
    return NextResponse.next();
  }

  try {
    const res = await fetch(`${apiUrl}/api/v1/tenants/config`, {
      headers: { host: hostname },
      // ISR: revalidate every 3600s — tenant branding changes rarely
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url));
    }

    const body = (await res.json()) as {
      data: { id: string; slug: string; name: string };
    };

    const response = NextResponse.next();
    response.headers.set('x-tenant-id', body.data.id);
    response.headers.set('x-tenant-slug', body.data.slug);
    return response;
  } catch {
    // API unreachable — fail closed to prevent data leakage across tenants
    return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url));
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
