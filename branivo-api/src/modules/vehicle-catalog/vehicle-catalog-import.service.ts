import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { VehicleCatalogSyncService } from './vehicle-catalog-sync.service';

interface ScrapedModification {
  brandName: string;
  brandSlug: string;
  brandLogoUrl: string;
  modelName: string;
  modelSlug: string;
  modelImageUrl?: string;
  generationName: string;
  modificationName: string;
  modificationImageUrl?: string;
  yearFrom: number | null;
  yearTo: number | null;
  bodyType: string | null;
  seats: number | null;
  doors: number | null;
  engineSizeCc: number | null;
  powerHp: number | null;
  powerKw: number | null;
  engineType: string | null;
  transmission: string | null;
  drive: string | null;
  maxSpeedKmh: number | null;
  acceleration0100: number | null;
  fuelConsumptionCity: number | null;
  fuelConsumptionHighway: number | null;
  fuelConsumptionCombined: number | null;
  weightKg: number | null;
  engineCode: string | null;
  rawData: Record<string, string>;
}

const POPULAR_MAKES = new Set([
  'volkswagen',
  'bmw',
  'mercedes-benz',
  'audi',
  'toyota',
  'ford',
  'opel',
  'renault',
  'peugeot',
  'citroen',
  'skoda',
  'seat',
  'honda',
  'hyundai',
  'kia',
  'nissan',
  'mazda',
  'volvo',
  'fiat',
  'alfa romeo',
]);

const BATCH = 300;
const INPUT_FILE = path.resolve(
  process.cwd(),
  '..',
  'scripts',
  'output',
  'autodata24-modifications.json',
);

function normalise(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

@Injectable()
export class VehicleCatalogImportService {
  private readonly logger = new Logger(VehicleCatalogImportService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly syncService: VehicleCatalogSyncService,
  ) {}

  async importFromJson(runId: string): Promise<number> {
    const log = (line: string): Promise<void> => {
      this.logger.log(line);
      return this.syncService.appendLog(runId, line);
    };

    await log(`▶ Четене на ${INPUT_FILE}...`);
    const raw = fs.readFileSync(INPUT_FILE, 'utf-8');
    const records = JSON.parse(raw) as ScrapedModification[];
    await log(`✓ Заредени ${records.length.toLocaleString()} записа от JSON`);

    // ── Phase 1: Makes ────────────────────────────────────────────────────────

    await log('▶ Фаза 1/3: Upsert на марки...');
    const makesBySlug = this.groupByKey(records, (r) => r.brandSlug);
    const makeIdBySlug = new Map<string, string>();

    const makeEntries = [...makesBySlug.entries()];
    for (let i = 0; i < makeEntries.length; i += BATCH) {
      const chunk = makeEntries.slice(i, i + BATCH);
      const values = chunk
        .map(([slug, recs]) => {
          const r = recs[0];
          const name = r.brandName.replace(/'/g, "''");
          const norm = normalise(r.brandName).replace(/'/g, "''");
          const logo = (r.brandLogoUrl ?? '').replace(/'/g, "''");
          const slugEsc = slug.replace(/'/g, "''");
          const popular = POPULAR_MAKES.has(normalise(r.brandName))
            ? 'true'
            : 'false';
          return `('${name}','${norm}',${logo ? `'${logo}'` : 'NULL'},'${slugEsc}','autodata24',${popular})`;
        })
        .join(',');

      const rows = await this.db.query<
        { id: string; autodata24_slug: string }[]
      >(`
        INSERT INTO vehicle_makes (name, normalized_name, logo_url, autodata24_slug, source, is_popular)
        VALUES ${values}
        ON CONFLICT (normalized_name) WHERE deleted_at IS NULL DO UPDATE
          SET logo_url        = EXCLUDED.logo_url,
              autodata24_slug = COALESCE(vehicle_makes.autodata24_slug, EXCLUDED.autodata24_slug),
              source          = 'autodata24',
              updated_at      = now()
        RETURNING id, autodata24_slug
      `);

      for (const row of rows) {
        if (row.autodata24_slug) makeIdBySlug.set(row.autodata24_slug, row.id);
      }
    }
    await log(`✓ ${makeIdBySlug.size} марки upsert-нати`);

    // ── Phase 2: Models ───────────────────────────────────────────────────────

    await log('▶ Фаза 2/3: Upsert на модели...');
    const modelKey = (r: ScrapedModification): string =>
      `${r.brandSlug}::${r.modelSlug}`;
    const modelsByKey = this.groupByKey(records, modelKey);
    const modelIdByKey = new Map<string, string>();

    const modelEntries = [...modelsByKey.entries()];
    for (let i = 0; i < modelEntries.length; i += BATCH) {
      const chunk = modelEntries.slice(i, i + BATCH);
      const validChunk = chunk.filter(([k]) =>
        makeIdBySlug.has(k.split('::')[0] ?? ''),
      );

      if (!validChunk.length) continue;

      const values = validChunk
        .map(([, recs]) => {
          const r = recs[0];
          const makeId = makeIdBySlug.get(r.brandSlug)!;
          const name = r.modelName.replace(/'/g, "''");
          const norm = normalise(r.modelName).replace(/'/g, "''");
          const slug = r.modelSlug.replace(/'/g, "''");
          const img = (r.modelImageUrl ?? '').replace(/'/g, "''");
          return `('${makeId}','${name}','${norm}','${slug}',${img ? `'${img}'` : 'NULL'},'autodata24')`;
        })
        .join(',');

      const rows = await this.db.query<
        { id: string; make_id: string; normalized_name: string }[]
      >(`
        INSERT INTO vehicle_models (make_id, name, normalized_name, autodata24_slug, image_url, source)
        VALUES ${values}
        ON CONFLICT (make_id, normalized_name) WHERE deleted_at IS NULL DO UPDATE
          SET autodata24_slug = COALESCE(vehicle_models.autodata24_slug, EXCLUDED.autodata24_slug),
              image_url       = COALESCE(vehicle_models.image_url, EXCLUDED.image_url),
              source          = 'autodata24',
              updated_at      = now()
        RETURNING id, make_id, normalized_name
      `);

      for (const row of rows) {
        const makeSlug = [...makeIdBySlug.entries()].find(
          ([, id]) => id === row.make_id,
        )?.[0];
        if (makeSlug) {
          const key = `${makeSlug}::${normalise(row.normalized_name)}`;
          modelIdByKey.set(key, row.id);
        }
      }
    }

    // Second pass: map by (makeId, normalizedModelName) for modifications lookup
    const modelLookup = new Map<string, string>(); // `${makeId}::${normalizedModelName}` → modelId
    for (const [k, v] of modelIdByKey) {
      const [brandSlug, modelNorm] = k.split('::');
      const makeId = makeIdBySlug.get(brandSlug ?? '');
      if (makeId) modelLookup.set(`${makeId}::${modelNorm ?? ''}`, v);
    }
    await log(`✓ ${modelIdByKey.size} модела upsert-нати`);

    // ── Phase 3: Modifications ────────────────────────────────────────────────

    await log('▶ Фаза 3/3: Bulk insert на модификации...');
    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < records.length; i += BATCH) {
      const chunk = records.slice(i, i + BATCH);

      const validRows: string[] = [];
      for (const r of chunk) {
        const makeId = makeIdBySlug.get(r.brandSlug);
        if (!makeId) {
          skipped++;
          continue;
        }
        const modelNorm = normalise(r.modelName);
        const modelId = modelLookup.get(`${makeId}::${modelNorm}`);
        if (!modelId) {
          skipped++;
          continue;
        }

        const name = r.modificationName.slice(0, 249).replace(/'/g, "''");
        const raw = JSON.stringify(r.rawData).replace(/'/g, "''");
        const imgUrl = (r.modificationImageUrl ?? '').replace(/'/g, "''");
        validRows.push(`(
          '${modelId}',
          '${name}',
          ${r.yearFrom ?? 'NULL'},
          ${r.yearTo ?? 'NULL'},
          ${r.engineType ? `'${r.engineType}'` : 'NULL'},
          ${r.engineSizeCc ?? 'NULL'},
          ${r.powerKw ?? 'NULL'},
          ${r.powerHp ?? 'NULL'},
          ${r.bodyType ? `'${r.bodyType}'` : 'NULL'},
          ${r.doors ?? 'NULL'},
          ${r.seats ?? 'NULL'},
          ${r.transmission ? `'${r.transmission}'` : 'NULL'},
          ${r.drive ? `'${r.drive}'` : 'NULL'},
          ${r.maxSpeedKmh ?? 'NULL'},
          ${r.acceleration0100 ?? 'NULL'},
          ${r.fuelConsumptionCity ?? 'NULL'},
          ${r.fuelConsumptionHighway ?? 'NULL'},
          ${r.fuelConsumptionCombined ?? 'NULL'},
          ${r.weightKg ?? 'NULL'},
          ${r.engineCode ? `'${r.engineCode.slice(0, 59).replace(/'/g, "''")}'` : 'NULL'},
          ${imgUrl ? `'${imgUrl}'` : 'NULL'},
          '${raw}'::jsonb,
          'autodata24'
        )`);
      }

      if (!validRows.length) continue;

      const rows = await this.db.query<{ id: string }[]>(`
        INSERT INTO vehicle_modifications (
          model_id, name, year_from, year_to, engine_type, engine_size_cc,
          power_kw, power_hp, body_type, doors, seats, transmission, drive,
          max_speed_kmh, acceleration_0_100, fuel_consumption_city,
          fuel_consumption_highway, fuel_consumption_combined,
          weight_kg, engine_code, image_url, raw_data, source
        ) VALUES ${validRows.join(',')}
        ON CONFLICT (model_id, name) WHERE deleted_at IS NULL DO NOTHING
        RETURNING id
      `);

      inserted += rows.length;

      if ((i / BATCH) % 10 === 0) {
        await log(
          `  → ${Math.min(i + BATCH, records.length).toLocaleString()} / ${records.length.toLocaleString()} обработени`,
        );
      }
    }

    await log(
      `✓ Модификации: ${inserted.toLocaleString()} нови, ${skipped.toLocaleString()} пропуснати`,
    );
    return inserted;
  }

  private groupByKey<T>(arr: T[], key: (item: T) => string): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const item of arr) {
      const k = key(item);
      const existing = map.get(k);
      if (existing) existing.push(item);
      else map.set(k, [item]);
    }
    return map;
  }
}
