import { NextRequest, NextResponse } from 'next/server';

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function extractImages(html: string): string[] {
  const urls: string[] = [];

  // Find the pictures_moving_details_small section
  const sectionMatch = html.match(/id="pictures_moving_details_small"[\s\S]*?<\/[^>]+>/);
  const searchArea = sectionMatch ? sectionMatch[0] : html;

  // Extract src attributes from img tags in that area
  const imgRegex = /<img[^>]+src="([^"]+\.(jpg|jpeg|png|webp)[^"]*)"/gi;
  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(searchArea)) !== null) {
    const src = match[1];
    if (src && !src.includes('logo') && !src.includes('flag') && !src.includes('icon')) {
      const absolute = src.startsWith('http') ? src : `https://www.autodata24.com${src}`;
      if (!urls.includes(absolute)) urls.push(absolute);
    }
  }

  return urls.slice(0, 6);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  const token = request.cookies.get('access_token')?.value;
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const makeSlug = request.nextUrl.searchParams.get('makeSlug') ?? '';
  const modelSlug = request.nextUrl.searchParams.get('modelSlug') ?? '';

  if (!makeSlug || !modelSlug) {
    return NextResponse.json({ message: 'makeSlug and modelSlug required' }, { status: 400 });
  }

  const mSlug = toSlug(makeSlug);
  const modSlug = toSlug(modelSlug);
  const detailsUrl = `https://www.autodata24.com/${mSlug}/${modSlug}/${modSlug}/details`;

  try {
    const res = await fetch(detailsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json({ images: [], detailsUrl }, { status: 200 });
    }

    const html = await res.text();
    const images = extractImages(html);
    return NextResponse.json({ images, detailsUrl, modelId: id });
  } catch {
    return NextResponse.json({ images: [], detailsUrl, modelId: id }, { status: 200 });
  }
}
