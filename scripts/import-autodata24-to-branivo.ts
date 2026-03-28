/**
 * import-autodata24-to-branivo.ts
 *
 * Imports scraped autodata24 modifications into the Branivo vehicle catalog.
 * Reads scripts/output/autodata24-modifications.json and upserts each record.
 *
 * Run:
 *   BRANIVO_API_URL=http://localhost:3000 BRANIVO_TOKEN=<jwt> \
 *   npx ts-node scripts/import-autodata24-to-branivo.ts
 *
 * The script:
 *  1. Creates missing makes  (POST /admin/vehicle-catalog/makes)
 *  2. Creates missing models (POST /admin/vehicle-catalog/models)
 *  3. Creates missing modifications (POST /admin/vehicle-catalog/modifications)
 *     409 Conflict = already imported → skip
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Autodata24Modification } from './autodata24-scraper';

// ─── Config ────────────────────────────────────────────────────────────────────

const API_URL = (process.env['BRANIVO_API_URL'] ?? 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = process.env['BRANIVO_TOKEN'] ?? '';
const INPUT_FILE = path.join(__dirname, 'output', 'autodata24-modifications.json');

// ─── Types ─────────────────────────────────────────────────────────────────────

interface BranivoMake {
  id: string;
  name: string;
}

interface BranivoModel {
  id: string;
  name: string;
  makeId: string;
}

// ─── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${endpoint}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`GET ${endpoint} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function apiPost(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<{ status: number }> {
  const res = await fetch(`${API_URL}/api/v1${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 409 && res.status !== 201) {
    const text = await res.text().catch(() => '');
    console.warn(`    POST ${endpoint} → HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return { status: res.status };
}

// ─── Normalise ────────────────────────────────────────────────────────────────

function normalise(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ─── Ensure make ──────────────────────────────────────────────────────────────

async function ensureMake(
  rec: Autodata24Modification,
  makeByName: Map<string, BranivoMake>,
): Promise<BranivoMake | null> {
  const key = normalise(rec.brandName);
  const existing = makeByName.get(key);
  if (existing) return existing;

  const result = await apiPost('/admin/vehicle-catalog/makes', {
    name: rec.brandName,
    logoUrl: rec.brandLogoUrl || undefined,
    autodata24Slug: rec.brandSlug,
    isActive: true,
    isPopular: false,
    source: 'autodata24',
  });

  if (result.status === 409 || result.status === 201) {
    // Fetch the newly created or conflicting make
    const makes = await apiFetch<BranivoMake[]>(
      `/admin/vehicle-catalog/makes?q=${encodeURIComponent(rec.brandName)}&limit=10&includeInactive=true`,
    );
    const found = makes.find((m) => normalise(m.name) === key);
    if (found) {
      makeByName.set(key, found);
      return found;
    }
  }
  return null;
}

// ─── Ensure model ─────────────────────────────────────────────────────────────

async function ensureModel(
  rec: Autodata24Modification,
  makeId: string,
  modelCache: Map<string, BranivoModel[]>,
  modelByKey: Map<string, BranivoModel>,
): Promise<BranivoModel | null> {
  const modelKey = `${makeId}::${normalise(rec.modelName)}`;
  const existing = modelByKey.get(modelKey);
  if (existing) return existing;

  if (!modelCache.has(makeId)) {
    const models = await apiFetch<BranivoModel[]>(
      `/admin/vehicle-catalog/models?makeId=${makeId}&limit=5000&includeInactive=true`,
    );
    modelCache.set(makeId, models);
    for (const m of models) {
      modelByKey.set(`${makeId}::${normalise(m.name)}`, m);
    }
    const already = modelByKey.get(modelKey);
    if (already) return already;
  }

  const result = await apiPost('/admin/vehicle-catalog/models', {
    makeId,
    name: rec.modelName,
    autodata24Slug: rec.modelSlug,
    imageUrl: rec.modelImageUrl || undefined,
    isActive: true,
    source: 'autodata24',
  });

  if (result.status === 409 || result.status === 201) {
    // Reload cache for this make
    const models = await apiFetch<BranivoModel[]>(
      `/admin/vehicle-catalog/models?makeId=${makeId}&limit=5000&includeInactive=true`,
    );
    modelCache.set(makeId, models);
    for (const m of models) {
      modelByKey.set(`${makeId}::${normalise(m.name)}`, m);
    }
    return modelByKey.get(modelKey) ?? null;
  }
  return null;
}

// ─── Import modification ──────────────────────────────────────────────────────

async function importModification(
  rec: Autodata24Modification,
  modelId: string,
): Promise<'imported' | 'skipped' | 'error'> {
  const name = `${rec.generationName} ${rec.modificationName}`.trim();
  const payload: Record<string, unknown> = {
    modelId,
    name,
    source: 'autodata24',
    rawData: rec.rawData,
  };

  if (rec.yearFrom) payload['yearFrom'] = rec.yearFrom;
  if (rec.yearTo) payload['yearTo'] = rec.yearTo;
  if (rec.engineSizeCc) payload['engineSizeCc'] = rec.engineSizeCc;
  if (rec.powerHp) payload['powerHp'] = rec.powerHp;
  if (rec.powerKw) payload['powerKw'] = rec.powerKw;
  if (rec.engineType) payload['engineType'] = rec.engineType;
  if (rec.bodyType) payload['bodyType'] = rec.bodyType;
  if (rec.doors) payload['doors'] = rec.doors;
  if (rec.seats) payload['seats'] = rec.seats;
  if (rec.transmission) payload['transmission'] = rec.transmission;
  if (rec.drive) payload['drive'] = rec.drive;
  if (rec.maxSpeedKmh) payload['maxSpeedKmh'] = rec.maxSpeedKmh;
  if (rec.acceleration0100) payload['acceleration0100'] = rec.acceleration0100;
  if (rec.fuelConsumptionCity) payload['fuelConsumptionCity'] = rec.fuelConsumptionCity;
  if (rec.fuelConsumptionHighway) payload['fuelConsumptionHighway'] = rec.fuelConsumptionHighway;
  if (rec.fuelConsumptionCombined) payload['fuelConsumptionCombined'] = rec.fuelConsumptionCombined;
  if (rec.weightKg) payload['weightKg'] = rec.weightKg;
  if (rec.engineCode) payload['engineCode'] = rec.engineCode;

  const result = await apiPost('/admin/vehicle-catalog/modifications', payload);
  if (result.status === 409) return 'skipped';
  if (result.status === 201) return 'imported';
  return 'error';
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!TOKEN) {
    console.error('Set BRANIVO_TOKEN to a valid admin JWT');
    process.exit(1);
  }
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Input file not found: ${INPUT_FILE}`);
    console.error('Run autodata24-scraper.ts first');
    process.exit(1);
  }

  const records = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8')) as Autodata24Modification[];
  console.log(`Loaded ${records.length} modification records`);

  const allMakes = await apiFetch<BranivoMake[]>(
    '/admin/vehicle-catalog/makes?limit=5000&includeInactive=true',
  );
  const makeByName = new Map<string, BranivoMake>(
    allMakes.map((m) => [normalise(m.name), m]),
  );

  const modelCache = new Map<string, BranivoModel[]>();
  const modelByKey = new Map<string, BranivoModel>();

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const rec of records) {
    const make = await ensureMake(rec, makeByName);
    if (!make) {
      errors++;
      continue;
    }

    const model = await ensureModel(rec, make.id, modelCache, modelByKey);
    if (!model) {
      errors++;
      continue;
    }

    const outcome = await importModification(rec, model.id);
    if (outcome === 'imported') imported++;
    else if (outcome === 'skipped') skipped++;
    else errors++;

    process.stdout.write(
      `\r  Imported: ${imported} | Skipped: ${skipped} | Errors: ${errors}   `,
    );
  }

  console.log('\n\nImport complete!');
  console.log(`  Imported : ${imported}`);
  console.log(`  Skipped  : ${skipped}`);
  console.log(`  Errors   : ${errors}`);
}

main().catch((err: unknown) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
