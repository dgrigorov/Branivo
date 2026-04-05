/**
 * autodata24-scraper.ts
 *
 * Crawls bg.autodata24.com and extracts full technical specs for every
 * individual vehicle modification (brand → model → generation → modification).
 *
 * Run:
 *   npx ts-node scripts/autodata24-scraper.ts
 *
 * Env vars (optional):
 *   BRAND_FILTER=bmw,mercedes-benz   # comma-separated slugs; empty = all brands
 *   MAX_CONCURRENCY=3
 *   DELAY_MS=800
 *
 * Output:
 *   scripts/output/autodata24-modifications.json   flat array for import
 *   scripts/output/autodata24-checkpoint.json      resumption checkpoint
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs-extra';
import * as path from 'path';

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = 'https://bg.autodata24.com';
const OUTPUT_DIR = path.join(__dirname, 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'autodata24-modifications.json');
const CHECKPOINT_FILE = path.join(OUTPUT_DIR, 'autodata24-checkpoint.json');
const MAX_CONCURRENCY = parseInt(process.env['MAX_CONCURRENCY'] ?? '3', 10);
const DELAY_MS = parseInt(process.env['DELAY_MS'] ?? '800', 10);
const RETRY_LIMIT = 2;
const BRAND_FILTER: string[] = (process.env['BRAND_FILTER'] ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Autodata24Modification {
  brandName: string;
  brandSlug: string;
  brandLogoUrl: string;
  modelName: string;
  modelSlug: string;
  modelImageUrl: string;
  generationName: string;
  generationSlug: string;
  modificationName: string;
  modificationUrl: string;
  modificationImageUrl: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  bodyType: string | null;
  seats: number | null;
  doors: number | null;
  engineSizeCc: number | null;
  powerHp: number | null;
  powerKw: number | null;
  engineType: string | null;
  drive: string | null;
  transmission: string | null;
  maxSpeedKmh: number | null;
  acceleration0100: number | null;
  fuelConsumptionCity: number | null;
  fuelConsumptionHighway: number | null;
  fuelConsumptionCombined: number | null;
  weightKg: number | null;
  engineCode: string | null;
  rawData: Record<string, string>;
}

interface BrandEntry {
  slug: string;
  name: string;
  logoUrl: string;
}

interface ModelTile {
  href: string;
  name: string;
  imageUrl: string;
  slug: string;
}

interface Checkpoint {
  completedBrands: string[];
  results: Autodata24Modification[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugFromHref(href: string): string {
  const parts = href.replace(/\/$/, '').split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  return last === 'details' || last === 'list' ? (parts[parts.length - 2] ?? '') : (last ?? '');
}

function pathSegmentCount(href: string): number {
  const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;
  try {
    return new URL(url).pathname.split('/').filter(Boolean).length;
  } catch {
    return 0;
  }
}

async function fetchHtml(url: string, attempt = 0): Promise<string> {
  try {
    await sleep(DELAY_MS);
    const res = await axios.get<string>(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'bg-BG,bg;q=0.9',
        Referer: BASE_URL,
      },
      timeout: 25000,
    });
    return res.data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (attempt < RETRY_LIMIT) {
      console.warn(`  [retry ${attempt + 1}] ${url} — ${msg}`);
      await sleep(3000 * (attempt + 1));
      return fetchHtml(url, attempt + 1);
    }
    throw new Error(`Fetch failed: ${url} — ${msg}`);
  }
}

async function runConcurrent<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;
  const worker = async (): Promise<void> => {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await (tasks[i] as () => Promise<T>)();
    }
  };
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

function loadCheckpoint(): Checkpoint {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf-8')) as Checkpoint;
    }
  } catch { /* ignore */ }
  return { completedBrands: [], results: [] };
}

function saveCheckpoint(cp: Checkpoint): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp));
}

function saveResults(results: Autodata24Modification[]): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\n  Saved ${results.length} modification records → ${OUTPUT_FILE}`);
}

// ─── Spec Parsers ─────────────────────────────────────────────────────────────

function parseYear(text: string): number | null {
  const m = /(\d{4})/.exec(text);
  return m ? parseInt(m[1], 10) : null;
}

function parseInteger(text: string): number | null {
  const m = /(\d+)/.exec(text.replace(/\s/g, ''));
  return m ? parseInt(m[1], 10) : null;
}

function parseDecimal(text: string): number | null {
  const m = /(\d+[.,]\d+)/.exec(text.replace(/\s/g, ''));
  if (m) return parseFloat(m[1].replace(',', '.'));
  return parseInteger(text);
}

function parseEngineCc(text: string): number | null {
  // "2 962 cm3", "2,962 cm3", "1598", "1.6"
  const ccMatch = /(\d[\d\s,]+)\s*cm3/i.exec(text);
  if (ccMatch) {
    const cleaned = ccMatch[1].replace(/[\s,]/g, '');
    return parseInt(cleaned, 10);
  }
  // litre format e.g. "2.0" or "1,6"
  const litMatch = /^(\d+)[.,](\d)/.exec(text.trim());
  if (litMatch) {
    return parseInt(litMatch[1], 10) * 1000 + parseInt(litMatch[2], 10) * 100;
  }
  return parseInteger(text);
}

function parsePowerHp(text: string): number | null {
  // "188 Hp", "170 hp", "125 к.с.", "188 кс"
  const m = /(\d+)\s*(?:hp|к\.с\.|кс|cv)/i.exec(text);
  return m ? parseInt(m[1], 10) : null;
}

function parsePowerKw(text: string): number | null {
  const m = /(\d+)\s*kw/i.exec(text);
  return m ? parseInt(m[1], 10) : null;
}

const BODY_TYPE_MAP: Record<string, string> = {
  седан: 'sedan',
  'седан (5 врати)': 'sedan',
  хечбек: 'hatchback',
  комби: 'station_wagon',
  кросоувър: 'crossover',
  suv: 'suv',
  'джип/suv': 'suv',
  купе: 'coupe',
  кабриолет: 'convertible',
  миниван: 'minivan',
  ван: 'van',
  пикап: 'pickup',
  микробус: 'minibus',
};

function mapBodyType(text: string): string | null {
  if (!text) return null;
  return BODY_TYPE_MAP[text.toLowerCase().trim()] ?? 'other';
}

const DRIVE_MAP: Record<string, string> = {
  предно: 'fwd',
  'предно предно': 'fwd',
  fwd: 'fwd',
  задно: 'rwd',
  rwd: 'rwd',
  'пълно': 'awd',
  awd: 'awd',
  '4x4': '4wd',
  '4wd': '4wd',
  '4×4': '4wd',
};

function mapDrive(text: string): string | null {
  if (!text) return null;
  return DRIVE_MAP[text.toLowerCase().trim()] ?? null;
}

function mapEngineType(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes('electric') || lower.includes('електр')) return 'electric';
  if (lower.includes('hybrid') || lower.includes('хибр')) return 'hybrid';
  if (lower.includes('diesel') || lower.includes('дизел')) return 'diesel';
  if (lower.includes('lpg') || lower.includes('газ')) return 'lpg';
  if (lower.includes('cng')) return 'cng';
  if (lower.includes('petrol') || lower.includes('бензин')) return 'petrol';
  return null;
}

function mapTransmission(manualGears: number | null, autoGears: number | null): string | null {
  if (autoGears) return 'automatic';
  if (manualGears) return 'manual';
  return null;
}

// ─── HTML Parsers ─────────────────────────────────────────────────────────────

function parseCharacteristicsTable(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  const specs: Record<string, string> = {};
  $('table.model-characteristics tbody tr').each((_, tr) => {
    const label = $(tr).find('td.label').text().trim();
    const value = $(tr).find('td.characteristic').text().replace(/\s+/g, ' ').trim();
    if (label && value) {
      specs[label] = value;
    }
  });
  return specs;
}

function parseGalleryImages(html: string): string[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const urls: string[] = [];
  // Non-cloned owl carousel items inside .auto-gallery contain the actual large images
  $('.auto-gallery #owlcarousel .owl-item:not(.cloned) img').each((_, el) => {
    const src = $(el).attr('src') ?? $(el).attr('data-src') ?? '';
    if (src && src.includes('cdn3.focus.bg') && !seen.has(src)) {
      seen.add(src);
      urls.push(src);
    }
  });
  // Fallback: any large cdn3.focus.bg image on the page (deduped)
  if (urls.length === 0) {
    $('img[src*="cdn3.focus.bg"][src*="/large/"]').each((_, el) => {
      const src = $(el).attr('src') ?? '';
      if (src && !seen.has(src)) { seen.add(src); urls.push(src); }
    });
  }
  return urls;
}

function parseModificationImageUrl(html: string): string | null {
  return parseGalleryImages(html)[0] ?? null;
}

function mapRawToStructured(
  raw: Record<string, string>,
): Omit<Autodata24Modification, 'brandName' | 'brandSlug' | 'brandLogoUrl' | 'modelName' | 'modelSlug' | 'modelImageUrl' | 'generationName' | 'generationSlug' | 'modificationName' | 'modificationUrl' | 'rawData'> {
  const manualGears = parseInteger(raw['Брой скорости (механични)'] ?? '');
  const autoGears = parseInteger(raw['Брой скорости (автоматични)'] ?? '');

  // Power: "Мощност" may say "188 Hp" or "138 kW(188 hp)" or "188 к.с. / 5700 rpm"
  const powerText = raw['Мощност'] ?? raw['Максимална мощност при'] ?? '';

  return {
    yearFrom: parseYear(raw['Година на пускане в производство'] ?? ''),
    yearTo: parseYear(raw['Година на спиране от производство'] ?? ''),
    bodyType: mapBodyType(raw['Тип на купето'] ?? ''),
    seats: parseInteger(raw['Брой места'] ?? ''),
    doors: parseInteger(raw['Врати'] ?? ''),
    engineSizeCc: parseEngineCc(raw['Обем на двигателя'] ?? ''),
    powerHp: parsePowerHp(powerText) ?? parsePowerHp(raw['Двигател (модификация)'] ?? ''),
    powerKw: parsePowerKw(powerText),
    engineType: mapEngineType(raw['Горивна система'] ?? raw['Тип гориво'] ?? ''),
    drive: mapDrive(raw['Задвижване'] ?? ''),
    transmission: mapTransmission(manualGears, autoGears),
    maxSpeedKmh: parseInteger(raw['Максимална скорост'] ?? ''),
    acceleration0100: parseDecimal(raw['Ускорение от място до 100 км/ч'] ?? ''),
    fuelConsumptionCity: parseDecimal(raw['Разход на гориво - градско'] ?? ''),
    fuelConsumptionHighway: parseDecimal(raw['Разход на гориво - извънградско'] ?? ''),
    fuelConsumptionCombined: parseDecimal(raw['Разход на гориво - комбинирано'] ?? ''),
    weightKg: parseInteger(raw['Тегло'] ?? ''),
    engineCode: raw['Модел на двигателя']?.trim() ?? null,
  };
}

function extractModificationName(raw: Record<string, string>, url: string): string {
  const fromTable = raw['Двигател (модификация)']?.trim();
  if (fromTable) return fromTable;
  // Fallback: last path segment before /details
  const parts = url.split('/').filter(Boolean);
  const idx = parts.indexOf('details');
  if (idx > 0) return parts[idx - 1].replace(/-/g, ' ');
  return 'Unknown';
}

// ─── Page Scrapers ────────────────────────────────────────────────────────────

async function getBrands(): Promise<BrandEntry[]> {
  console.log('[step 1] Fetching brand list from /all-brands...');
  const html = await fetchHtml(`${BASE_URL}/all-brands`);
  const $ = cheerio.load(html);
  const brands: BrandEntry[] = [];
  $('.tiles-grid a').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const name = $(el).find('.auto-name').text().trim();
    const logoUrl = $(el).find('.auto-logo img').attr('src') ?? '';
    const slug = href.replace(/^\//, '').replace(/\/list$/, '');
    if (slug && name && (BRAND_FILTER.length === 0 || BRAND_FILTER.includes(slug))) {
      brands.push({ slug, name, logoUrl });
    }
  });
  console.log(`  Found ${brands.length} brand(s): ${brands.map((b) => b.slug).join(', ')}`);
  return brands;
}

async function getModelTiles(brandSlug: string): Promise<ModelTile[]> {
  const html = await fetchHtml(`${BASE_URL}/${brandSlug}/list`);
  const $ = cheerio.load(html);
  const tiles: ModelTile[] = [];
  $('.tiles-grid a').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const name = $(el).find('.auto-name').text().trim();
    const imageUrl = $(el).find('.auto-logo img').attr('src') ?? '';
    const slug = slugFromHref(href);
    if (name && href.startsWith(`/${brandSlug}/`)) {
      tiles.push({ href: href.startsWith('http') ? href : `${BASE_URL}${href}`, name, imageUrl, slug });
    }
  });
  return tiles;
}

async function getGenerationTiles(modelListUrl: string, brandSlug: string): Promise<ModelTile[]> {
  const html = await fetchHtml(modelListUrl);
  const $ = cheerio.load(html);
  const tiles: ModelTile[] = [];
  $('.tiles-grid a').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const name = $(el).find('.auto-name').text().trim();
    const imageUrl = $(el).find('.auto-logo img').attr('src') ?? '';
    const slug = slugFromHref(href);
    const full = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    if (name && href.includes(`/${brandSlug}/`) && full.endsWith('/details')) {
      tiles.push({ href: full, name, imageUrl, slug });
    }
  });
  return tiles;
}

async function getModificationLinks(
  genDetailsUrl: string,
  brandSlug: string,
): Promise<{ links: string[]; galleryImages: string[] }> {
  let html: string;
  try {
    html = await fetchHtml(genDetailsUrl);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`    [warn] Could not fetch gen page ${genDetailsUrl}: ${msg}`);
    return { links: [], galleryImages: [] };
  }
  const $ = cheerio.load(html);
  const links = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const full = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    // Individual modification pages have 5 path segments: brand/model/gen/mod/details
    if (full.includes(`/${brandSlug}/`) && full.endsWith('/details') && pathSegmentCount(full) === 5) {
      links.add(full);
    }
  });
  const galleryImages = parseGalleryImages(html);
  return { links: Array.from(links), galleryImages };
}

async function scrapeModificationPage(
  modUrl: string,
  brand: BrandEntry,
  modelName: string,
  modelSlug: string,
  modelImageUrl: string,
  genName: string,
  genSlug: string,
): Promise<Autodata24Modification | null> {
  let html: string;
  try {
    html = await fetchHtml(modUrl);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`    [error] ${modUrl}: ${msg}`);
    return null;
  }
  const rawData = parseCharacteristicsTable(html);
  if (Object.keys(rawData).length === 0) return null;
  const structured = mapRawToStructured(rawData);
  const modificationName = extractModificationName(rawData, modUrl);
  const modificationImageUrl = parseModificationImageUrl(html);
  return {
    brandName: brand.name,
    brandSlug: brand.slug,
    brandLogoUrl: brand.logoUrl,
    modelName,
    modelSlug,
    modelImageUrl,
    generationName: genName,
    generationSlug: genSlug,
    modificationName,
    modificationUrl: modUrl,
    modificationImageUrl,
    ...structured,
    rawData,
  };
}

// ─── Brand Processor ──────────────────────────────────────────────────────────

async function processBrand(
  brand: BrandEntry,
  results: Autodata24Modification[],
): Promise<void> {
  console.log(`\n[brand] ${brand.name} (${brand.slug})`);
  let models: ModelTile[];
  try {
    models = await getModelTiles(brand.slug);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  [error] Brand models page: ${msg}`);
    return;
  }
  console.log(`  ${models.length} model(s)`);

  for (const model of models) {
    console.log(`  [model] ${model.name}`);
    let generationTiles: ModelTile[];

    if (model.href.endsWith('/list')) {
      try {
        generationTiles = await getGenerationTiles(model.href, brand.slug);
      } catch {
        generationTiles = [];
      }
    } else {
      // Direct generation page (single generation)
      generationTiles = [{ href: model.href, name: model.name, imageUrl: model.imageUrl, slug: model.slug }];
    }

    const genTasks = generationTiles.map((gen) => async () => {
      const { links: modLinks, galleryImages } = await getModificationLinks(gen.href, brand.slug);
      if (!modLinks.length) {
        console.warn(`    [warn] No individual modification links found at ${gen.href}`);
        return;
      }
      // Prefer first gallery image (already /large/) over the blurry tile thumbnail
      const bestModelImage = galleryImages[0] ?? model.imageUrl;
      console.log(
        `    [gen] ${gen.name} → ${modLinks.length} modification(s)` +
        (galleryImages.length ? ` | ${galleryImages.length} gallery images` : ''),
      );

      const modTasks = modLinks.map((modUrl) => async () => {
        const rec = await scrapeModificationPage(
          modUrl,
          brand,
          model.name,
          model.slug,
          bestModelImage,
          gen.name,
          gen.slug,
        );
        if (rec) {
          results.push(rec);
          process.stdout.write(`\r    Total: ${results.length} modifications`);
        }
      });
      await runConcurrent(modTasks, MAX_CONCURRENCY);
    });

    await runConcurrent(genTasks, MAX_CONCURRENCY);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const cp = loadCheckpoint();
  const results: Autodata24Modification[] = cp.results;
  const completed = new Set<string>(cp.completedBrands);

  if (completed.size > 0) {
    console.log(`Resuming — already completed: ${[...completed].join(', ')}`);
    console.log(`Existing records: ${results.length}`);
  }

  const brands = await getBrands();

  for (const brand of brands) {
    if (completed.has(brand.slug)) {
      console.log(`[skip] ${brand.slug} (already done)`);
      continue;
    }
    await processBrand(brand, results);
    completed.add(brand.slug);
    saveCheckpoint({ completedBrands: [...completed], results });
    saveResults(results);
  }

  saveResults(results);
  if (fs.existsSync(CHECKPOINT_FILE)) {
    fs.unlinkSync(CHECKPOINT_FILE);
  }
  console.log('\n\n[done] Scraping complete.');
  console.log(`  Total modifications: ${results.length}`);
  console.log(`  Output: ${OUTPUT_FILE}`);
  console.log('\nTo import into Branivo:');
  console.log('  npx ts-node scripts/import-autodata24-to-branivo.ts');
}

main().catch((err: unknown) => {
  console.error('[fatal]', err instanceof Error ? err.message : err);
  process.exit(1);
});
