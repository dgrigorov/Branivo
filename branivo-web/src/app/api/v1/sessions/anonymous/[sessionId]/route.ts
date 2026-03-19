export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  const { sessionId } = await params;
  const res = await fetch(
    `${process.env.BRANIVO_API_URL}/api/v1/sessions/anonymous/${sessionId}`,
    {
      headers: {
        Host: request.headers.get('host') ?? '',
      },
    },
  );

  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  const { sessionId } = await params;
  const body = await request.text();

  const res = await fetch(
    `${process.env.BRANIVO_API_URL}/api/v1/sessions/anonymous/${sessionId}/data`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Host: request.headers.get('host') ?? '',
      },
      body,
    },
  );

  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
