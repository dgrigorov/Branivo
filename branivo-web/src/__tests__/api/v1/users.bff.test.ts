/**
 * @jest-environment node
 *
 * BFF route handler tests for /api/v1/users.
 * Verifies auth cookie forwarding, early 401 on missing token, and upstream proxy behaviour.
 */
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/v1/users/route';
import { DELETE } from '@/app/api/v1/users/[id]/route';
import { PUT } from '@/app/api/v1/users/[id]/role/route';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function makeRequest(
  url: string,
  options: { cookie?: string; method?: string; body?: unknown } = {},
): NextRequest {
  const headers: Record<string, string> = { host: 'tenant.branivo.com' };
  if (options.cookie) headers['cookie'] = options.cookie;

  return new NextRequest(new Request(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  }));
}

function mockUpstream(status: number, body: unknown) {
  mockFetch.mockResolvedValueOnce({
    status,
    headers: { get: () => 'application/json; charset=utf-8' },
    json: async () => body,
  });
}

describe('GET /api/v1/users BFF', () => {
  afterEach(() => mockFetch.mockReset());

  it('returns 401 immediately when access_token cookie is absent', async () => {
    const req = makeRequest('http://localhost/api/v1/users');
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('forwards Authorization: Bearer header to NestJS', async () => {
    mockUpstream(200, []);
    const req = makeRequest('http://localhost/api/v1/users', {
      cookie: 'access_token=my-jwt',
    });

    await GET(req);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/users'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer my-jwt' }),
      }),
    );
  });

  it('proxies upstream status code to client', async () => {
    mockUpstream(403, { message: 'Forbidden' });
    const req = makeRequest('http://localhost/api/v1/users', {
      cookie: 'access_token=my-jwt',
    });

    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it('handles non-JSON upstream response gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 503,
      headers: { get: () => 'text/html' },
      text: async () => 'Service Unavailable',
    });
    const req = makeRequest('http://localhost/api/v1/users', {
      cookie: 'access_token=my-jwt',
    });

    const res = await GET(req);
    expect(res.status).toBe(503);
    const body = await res.json() as { message: string };
    expect(body.message).toBe('Service Unavailable');
  });
});

describe('POST /api/v1/users BFF', () => {
  afterEach(() => mockFetch.mockReset());

  it('returns 401 when no cookie', async () => {
    const req = makeRequest('http://localhost/api/v1/users', { method: 'POST', body: {} });
    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('forwards POST body and Bearer token to NestJS', async () => {
    mockUpstream(201, { id: 'new-user-uuid' });
    const payload = { email: 'new@example.com', role: 'broker_agent', password: 'Test1!' };
    const req = makeRequest('http://localhost/api/v1/users', {
      method: 'POST',
      cookie: 'access_token=my-jwt',
      body: payload,
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/users'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer my-jwt' }),
      }),
    );
  });
});

describe('DELETE /api/v1/users/[id] BFF', () => {
  afterEach(() => mockFetch.mockReset());

  it('returns 401 when no cookie', async () => {
    const req = makeRequest('http://localhost/api/v1/users/some-id', { method: 'DELETE' });
    const res = await DELETE(req, { params: { id: 'some-id' } });

    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('forwards DELETE request with correct user id', async () => {
    mockUpstream(200, { message: 'User deleted successfully' });
    const req = makeRequest('http://localhost/api/v1/users/user-uuid', {
      method: 'DELETE',
      cookie: 'access_token=my-jwt',
    });

    await DELETE(req, { params: { id: 'user-uuid' } });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/users/user-uuid'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

describe('PUT /api/v1/users/[id]/role BFF', () => {
  afterEach(() => mockFetch.mockReset());

  it('returns 401 when no cookie', async () => {
    const req = makeRequest('http://localhost/api/v1/users/some-id/role', {
      method: 'PUT',
      body: { role: 'broker_viewer' },
    });
    const res = await PUT(req, { params: { id: 'some-id' } });

    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('forwards PUT body and Bearer token', async () => {
    mockUpstream(200, { message: 'Role updated successfully' });
    const req = makeRequest('http://localhost/api/v1/users/user-uuid/role', {
      method: 'PUT',
      cookie: 'access_token=my-jwt',
      body: { role: 'broker_viewer' },
    });

    await PUT(req, { params: { id: 'user-uuid' } });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/users/user-uuid/role'),
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ Authorization: 'Bearer my-jwt' }),
      }),
    );
  });
});
