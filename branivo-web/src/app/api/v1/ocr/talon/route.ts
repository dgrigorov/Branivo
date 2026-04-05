import { NextRequest, NextResponse } from 'next/server';

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL ?? 'http://localhost:8000';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const step = req.nextUrl.searchParams.get('step') ?? '1';
  const debug = req.nextUrl.searchParams.get('debug') ?? 'false';

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ message: 'Invalid form data' }, { status: 400 });
  }

  const ocrRes = await fetch(
    `${OCR_SERVICE_URL}/ocr/talon?step=${step}&debug=${debug}`,
    { method: 'POST', body: formData },
  ).catch(() => null);

  if (!ocrRes) {
    return NextResponse.json(
      { message: 'OCR service unavailable' },
      { status: 503 },
    );
  }

  const data: unknown = await ocrRes.json().catch(() => ({}));
  return NextResponse.json(data, { status: ocrRes.status });
}
