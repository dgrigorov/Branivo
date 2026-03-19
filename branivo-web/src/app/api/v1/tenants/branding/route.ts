export async function PUT(request: Request): Promise<Response> {
  // Forward multipart/form-data directly — do NOT set Content-Type manually,
  // fetch will set it automatically with the correct boundary.
  const formData = await request.formData();
  const res = await fetch(
    `${process.env.BRANIVO_API_URL}/api/v1/tenants/branding`,
    {
      method: 'PUT',
      headers: {
        Cookie: request.headers.get('cookie') ?? '',
        Host: request.headers.get('host') ?? '',
      },
      body: formData,
    },
  );
  return new Response(res.body, { status: res.status });
}
