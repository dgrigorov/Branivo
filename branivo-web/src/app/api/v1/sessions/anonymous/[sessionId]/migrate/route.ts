export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  const { sessionId } = await params;

  const res = await fetch(
    `${process.env.BRANIVO_API_URL}/api/v1/sessions/anonymous/${sessionId}/migrate`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward auth cookie for JWT validation in NestJS
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
