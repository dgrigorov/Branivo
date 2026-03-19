export async function POST(request: Request): Promise<Response> {
  const res = await fetch(
    `${process.env.BRANIVO_API_URL}/api/v1/sessions/anonymous`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Host: request.headers.get('host') ?? '',
      },
    },
  );

  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
