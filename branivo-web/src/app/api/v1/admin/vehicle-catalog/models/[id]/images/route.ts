import { NextRequest, NextResponse } from 'next/server';

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Extract gallery images from autodata24 HTML.
 * Strategy 1: target `carouselimg` class images — these are the gallery images
 *   already in /large/ format. The carousel has cloned items (duplicates) so
 *   we deduplicate by URL.
 * Strategy 2: fallback — any cdn3.focus.bg /large/ image on the page.
 */
function extractImages(html: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  // Strategy 1: gallery carousel images (class="carouselimg ...")
  // These are already /large/ — no URL rewriting needed.
  const carouselRegex = /<img\b[^>]*\bclass="[^"]*carouselimg[^"]*"[^>]*\bsrc="(https:\/\/cdn3\.focus\.bg[^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = carouselRegex.exec(html)) !== null) {
    const src = m[1];
    if (src && !seen.has(src)) { seen.add(src); urls.push(src); }
  }
  if (urls.length > 0) return urls.slice(0, 20);

  // Strategy 2: any cdn3.focus.bg /large/ image
  const largeRegex = /src="(https:\/\/cdn3\.focus\.bg\/autodata\/i\/[^"]+\/large\/[^"]+)"/gi;
  while ((m = largeRegex.exec(html)) !== null) {
    const src = m[1];
    if (src && !seen.has(src)) { seen.add(src); urls.push(src); }
  }
  return urls.slice(0, 20);
}

async function tryFetch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
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

  // The model-level details page (4 segments) holds the gallery for the whole model/generation.
  // e.g. https://www.autodata24.com/bmw/2er-active-tourer/2er-active-tourer/details
  const candidateUrls = [
    `https://www.autodata24.com/${mSlug}/${modSlug}/${modSlug}/details`,
    `https://www.autodata24.com/${mSlug}/${modSlug}/`,
  ];

  for (const url of candidateUrls) {
    const html = await tryFetch(url);
    if (!html) continue;
    const images = extractImages(html);
    if (images.length > 0) {
      return NextResponse.json(
        { images, sourceUrl: url, modelId: id },
        { headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600' } },
      );
    }
  }

  return NextResponse.json(
    { images: [], sourceUrl: candidateUrls[0] ?? '', modelId: id },
    { headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600' } },
  );
}
