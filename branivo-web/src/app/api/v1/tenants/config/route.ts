export async function GET(request: Request): Promise<Response> {
  const res = await fetch(
    `${process.env.BRANIVO_API_URL}/api/v1/tenants/config`,
    {
      headers: {
        Cookie: request.headers.get('cookie') ?? '',
        Host: request.headers.get('host') ?? '',
      },
    },
  );
  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
