import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { load } from 'cheerio';
import { randomUUID } from 'crypto';
import { ILike, Repository } from 'typeorm';
import { FSC_CATEGORIES } from './insurers.constants';
import { FscInsurerQueryDto, FscSyncResponseDto } from './dto/fsc-insurer.dto';
import { FscInsurerEntity } from './entities/fsc-insurer.entity';

type ParsedRow = {
  name: string;
  eik: string | null;
  officeAddress: string | null;
  website: string | null;
  contactDetails: string | null;
  contactPhone: string | null;
  contactEmails: string[];
};

type WebsiteEnrichment = {
  longDescription: string | null;
  logoUrl: string | null;
  socialLinks: string[];
  trustpilotUrl: string | null;
  websiteEnrichedAt: Date | null;
  contactPhone: string | null;
  contactEmails: string[];
};

type SyncLogLevel = 'info' | 'warn' | 'error';

type FscSyncStatus = {
  runId: string | null;
  status: 'idle' | 'running' | 'success' | 'error';
  startedAt: string | null;
  finishedAt: string | null;
  total: number | null;
  byCategory: FscSyncResponseDto['byCategory'];
  errorMessage: string | null;
  logs: Array<{
    at: string;
    level: SyncLogLevel;
    message: string;
  }>;
};

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value);
  }
  return result;
}

function extractContactParts(
  contactDetailsRaw: string,
  additionalEmails: string[] = [],
): {
  contactPhone: string | null;
  contactEmails: string[];
} {
  const details = cleanText(contactDetailsRaw);
  const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const matchedEmails = details ? (details.match(emailRegex) ?? []) : [];
  const contactEmails = uniqueStrings(
    [...matchedEmails, ...additionalEmails]
      .map((email) => cleanText(email))
      .filter((email) => email.length > 0)
      .map((email) => email.toLowerCase()),
  );

  let phonesRaw = details;
  for (const email of matchedEmails) {
    phonesRaw = phonesRaw.replace(email, ' ');
  }
  phonesRaw = phonesRaw
    .replace(/\s*(или|or)\s*/gi, '; ')
    .replace(/\s+/g, ' ')
    .trim();

  const phoneParts = uniqueStrings(
    phonesRaw
      .split(/[;,]/)
      .map((part) => cleanText(part))
      .filter((part) => /\d/.test(part)),
  );

  return {
    contactPhone: phoneParts.length > 0 ? phoneParts.join('; ') : null,
    contactEmails,
  };
}

function withHttps(url: string): string {
  const trimmed = cleanText(url);
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

function truncate(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen - 1)}…`;
}

function hasText(value: string | null | undefined): value is string {
  return Boolean(value && cleanText(value).length > 0);
}

function isHeaderRow(firstCellText: string): boolean {
  const normalized = cleanText(firstCellText).toLowerCase();
  return (
    normalized.includes('наименование') ||
    normalized.includes('име') ||
    normalized.includes('eik') ||
    normalized.includes('еик')
  );
}

@Injectable()
export class InsurersService {
  private readonly logger = new Logger(InsurersService.name);
  private latestSyncStatus: FscSyncStatus = {
    runId: null,
    status: 'idle',
    startedAt: null,
    finishedAt: null,
    total: null,
    byCategory: [],
    errorMessage: null,
    logs: [],
  };
  private activeSyncPromise: Promise<FscSyncResponseDto> | null = null;

  constructor(
    @InjectRepository(FscInsurerEntity)
    private readonly repo: Repository<FscInsurerEntity>,
    private readonly config: ConfigService,
  ) {}

  async syncFromFsc(): Promise<FscSyncResponseDto> {
    if (this.activeSyncPromise) {
      this.pushSyncLog('warn', 'FSC sync вече е стартиран. Изчакване на текущия run.');
      return this.activeSyncPromise;
    }

    const runId = randomUUID();
    this.latestSyncStatus = {
      runId,
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      total: null,
      byCategory: [],
      errorMessage: null,
      logs: [],
    };
    this.pushSyncLog('info', `FSC sync start (runId: ${runId})`);

    this.activeSyncPromise = this.doSyncFromFsc();
    return this.activeSyncPromise.finally(() => {
      this.activeSyncPromise = null;
    });
  }

  getSyncStatus(): FscSyncStatus {
    return this.latestSyncStatus;
  }

  private async doSyncFromFsc(): Promise<FscSyncResponseDto> {
    const now = new Date();
    const byCategory: FscSyncResponseDto['byCategory'] = [];
    let total = 0;
    const enrichmentCache = new Map<string, WebsiteEnrichment>();

    try {
      for (const category of FSC_CATEGORIES) {
        this.pushSyncLog(
          'info',
          `Обхождане на категория "${category.label}" (${category.key})`,
        );
        const rows = await this.scrapeCategory(category.url);
        if (rows.length === 0) {
          const msg = `FSC scrape returned 0 rows for ${category.key} (${category.url}). Keeping previous data.`;
          this.logger.warn(msg);
          this.pushSyncLog('warn', msg);
          byCategory.push({
            categoryKey: category.key,
            categoryLabel: category.label,
            url: category.url,
            imported: 0,
          });
          continue;
        }

        this.pushSyncLog(
          'info',
          `Категория "${category.label}": scraped ${rows.length} реда`,
        );

        const enrichedRows = await this.enrichRows(rows, enrichmentCache);
        const dedupedRows = this.deduplicateRows(enrichedRows);
        const existing = await this.repo.find({
          where: { categoryKey: category.key },
        });
        const existingByKey = new Map<string, FscInsurerEntity>();
        for (const row of existing) {
          existingByKey.set(this.getDedupKey(row.name, row.eik), row);
        }

        const entities = dedupedRows.map((r) => {
          const existingEntity = existingByKey.get(this.getDedupKey(r.name, r.eik));
          return this.buildMergedEntity({
            existing: existingEntity,
            scraped: r,
            categoryKey: category.key,
            categoryLabel: category.label,
            sourceUrl: category.url,
            now,
          });
        });

        if (entities.length > 0) {
          await this.repo.save(entities);
        }

        byCategory.push({
          categoryKey: category.key,
          categoryLabel: category.label,
          url: category.url,
          imported: entities.length,
        });
        total += entities.length;
        this.pushSyncLog(
          'info',
          `Категория "${category.label}": записани ${entities.length} реда`,
        );
      }

      const result: FscSyncResponseDto = {
        total,
        byCategory,
        syncedAt: now.toISOString(),
      };
      this.latestSyncStatus = {
        ...this.latestSyncStatus,
        status: 'success',
        total,
        byCategory,
        finishedAt: new Date().toISOString(),
        errorMessage: null,
      };
      this.pushSyncLog('info', `FSC sync success. Общо импортирани: ${total}`);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.latestSyncStatus = {
        ...this.latestSyncStatus,
        status: 'error',
        finishedAt: new Date().toISOString(),
        errorMessage: message,
        total,
        byCategory,
      };
      this.pushSyncLog('error', `FSC sync failed: ${message}`);
      this.logger.error('FSC sync failed', err instanceof Error ? err.stack : undefined);
      throw err;
    }
  }

  async list(query: FscInsurerQueryDto): Promise<FscInsurerEntity[]> {
    const where: Record<string, unknown>[] = [];
    const limit = query.limit ?? 500;

    if (query.q) {
      const q = `%${query.q}%`;
      if (query.categoryKey) {
        where.push(
          { categoryKey: query.categoryKey, name: ILike(q) },
          { categoryKey: query.categoryKey, eik: ILike(q) },
        );
      } else {
        where.push({ name: ILike(q) }, { eik: ILike(q) });
      }
    } else if (query.categoryKey) {
      where.push({ categoryKey: query.categoryKey });
    }

    return this.repo.find({
      where: where.length > 0 ? where : undefined,
      take: limit,
      order: {
        categoryLabel: 'ASC',
        name: 'ASC',
      },
    });
  }

  private async scrapeCategory(url: string): Promise<ParsedRow[]> {
    const response = await axios.get<string>(url, {
      timeout: 30000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15',
      },
      responseType: 'text',
    });

    const $ = load(response.data);
    const rows: ParsedRow[] = [];

    let table = $('#myTable').first();
    if (table.length === 0) {
      table = $('.wp-block-table table').first();
    }
    if (table.length === 0) {
      table = $('table').first();
    }

    if (table.length === 0) {
      this.logger.warn(`No table found at ${url}`);
      return rows;
    }

    table.find('tr').each((_idx, tr) => {
      const tds = $(tr).find('td');
      if (tds.length < 4) return;

      const firstCellText = cleanText($(tds[0]).text());
      if (isHeaderRow(firstCellText)) return;

      const name = firstCellText;
      const eikRaw = cleanText($(tds[1]).text());
      const officeAddressRaw = cleanText($(tds[2]).text());
      const websiteHref = cleanText($(tds[3]).find('a').attr('href') ?? '');
      const websiteText = cleanText($(tds[3]).text());
      const contactCell = $(tds[4]);
      const contactDetailsRaw = cleanText(contactCell.text());
      const mailtoEmails = contactCell
        .find('a[href^="mailto:"]')
        .map((_i, el) => {
          const href = cleanText($(el).attr('href') ?? '');
          if (!href) return '';
          return href.replace(/^mailto:/i, '').split('?')[0];
        })
        .get()
        .filter((email) => email.length > 0);
      const { contactPhone, contactEmails } = extractContactParts(
        contactDetailsRaw,
        mailtoEmails,
      );

      if (!name) return;
      rows.push({
        name,
        eik: eikRaw || null,
        officeAddress: officeAddressRaw || null,
        website: websiteHref || websiteText || null,
        contactDetails: contactDetailsRaw || null,
        contactPhone,
        contactEmails,
      });
    });

    this.logger.log(`FSC scrape parsed ${rows.length} rows from ${url}`);
    return rows;
  }

  private async enrichRows(
    rows: ParsedRow[],
    cache: Map<string, WebsiteEnrichment>,
  ): Promise<Array<ParsedRow & WebsiteEnrichment>> {
    const limit = 6;
    const output: Array<ParsedRow & WebsiteEnrichment> = new Array(rows.length);
    let idx = 0;

    const worker = async (): Promise<void> => {
      while (idx < rows.length) {
        const current = idx++;
        const row = rows[current];
        const enrichment = await this.getWebsiteEnrichment(row.website, cache);
        output[current] = {
          ...row,
          ...enrichment,
          contactPhone: row.contactPhone ?? enrichment.contactPhone,
          contactEmails: uniqueStrings([
            ...(row.contactEmails ?? []),
            ...(enrichment.contactEmails ?? []),
          ]),
        };
      }
    };

    await Promise.all(Array.from({ length: Math.min(limit, rows.length) }, worker));
    return output;
  }

  private deduplicateRows(
    rows: Array<ParsedRow & WebsiteEnrichment>,
  ): Array<ParsedRow & WebsiteEnrichment> {
    const seen = new Set<string>();
    const deduped: Array<ParsedRow & WebsiteEnrichment> = [];

    for (const row of rows) {
      const key = `${(row.eik ?? '').toLowerCase()}::${row.name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(row);
    }

    return deduped;
  }

  private getDedupKey(name: string, eik: string | null): string {
    return `${(eik ?? '').toLowerCase()}::${name.toLowerCase()}`;
  }

  private buildMergedEntity(params: {
    existing?: FscInsurerEntity;
    scraped: ParsedRow & WebsiteEnrichment;
    categoryKey: string;
    categoryLabel: string;
    sourceUrl: string;
    now: Date;
  }): FscInsurerEntity {
    const { existing, scraped, categoryKey, categoryLabel, sourceUrl, now } = params;

    const pickString = (
      oldVal: string | null | undefined,
      newVal: string | null | undefined,
    ): string | null => {
      if (hasText(oldVal)) return oldVal;
      if (hasText(newVal)) return newVal;
      return null;
    };

    const pickArray = (oldVal: string[] | null | undefined, newVal: string[] | null | undefined): string[] => {
      if (oldVal && oldVal.length > 0) return oldVal;
      if (newVal && newVal.length > 0) return uniqueStrings(newVal);
      return [];
    };

    if (existing) {
      existing.categoryLabel = existing.categoryLabel || categoryLabel;
      existing.eik = pickString(existing.eik, scraped.eik);
      existing.officeAddress = pickString(existing.officeAddress, scraped.officeAddress);
      existing.website = pickString(existing.website, scraped.website);
      existing.contactDetails = pickString(existing.contactDetails, scraped.contactDetails);
      existing.contactPhone = pickString(existing.contactPhone, scraped.contactPhone);
      existing.contactEmails = pickArray(existing.contactEmails, scraped.contactEmails);
      existing.longDescription = pickString(existing.longDescription, scraped.longDescription);
      existing.socialLinks = pickArray(existing.socialLinks, scraped.socialLinks);
      existing.trustpilotUrl = pickString(existing.trustpilotUrl, scraped.trustpilotUrl);
      existing.websiteEnrichedAt = existing.websiteEnrichedAt ?? scraped.websiteEnrichedAt;
      existing.sourceUrl = existing.sourceUrl || sourceUrl;
      existing.scrapedAt = existing.scrapedAt ?? now;
      return existing;
    }

    return this.repo.create({
      categoryKey,
      categoryLabel,
      name: scraped.name,
      eik: scraped.eik,
      officeAddress: scraped.officeAddress,
      website: scraped.website,
      contactDetails: scraped.contactDetails,
      contactPhone: scraped.contactPhone,
      contactEmails: scraped.contactEmails,
      longDescription: scraped.longDescription,
      logoUrl: null,
      socialLinks: scraped.socialLinks,
      trustpilotUrl: scraped.trustpilotUrl,
      websiteEnrichedAt: scraped.websiteEnrichedAt,
      sourceUrl,
      scrapedAt: now,
    });
  }

  private async getWebsiteEnrichment(
    website: string | null,
    cache: Map<string, WebsiteEnrichment>,
  ): Promise<WebsiteEnrichment> {
    const empty: WebsiteEnrichment = {
      longDescription: null,
      logoUrl: null,
      socialLinks: [],
      trustpilotUrl: null,
      websiteEnrichedAt: null,
      contactPhone: null,
      contactEmails: [],
    };
    if (!website) return empty;

    let normalizedUrl: string;
    try {
      normalizedUrl = withHttps(website);
      const parsed = new URL(normalizedUrl);
      normalizedUrl = parsed.toString();
      const cacheKey = parsed.hostname.toLowerCase();
      const cached = cache.get(cacheKey);
      if (cached) return cached;

      const response = await axios.get<string>(normalizedUrl, {
        timeout: 12000,
        maxRedirects: 5,
        responseType: 'text',
        validateStatus: (status) => status >= 200 && status < 400,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15',
        },
      });

      const enrichment = this.extractWebsiteMetadata(
        response.data,
        response.request?.res?.responseUrl ?? normalizedUrl,
      );
      cache.set(cacheKey, enrichment);
      return enrichment;
    } catch (err) {
      this.logger.debug(
        `Website enrichment skipped for "${website}": ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
      return empty;
    }
  }

  private extractWebsiteMetadata(
    html: string,
    pageUrl: string,
  ): WebsiteEnrichment {
    const $ = load(html);
    const bodyClone = $('body').clone();
    bodyClone.find('script, style, noscript').remove();
    const rawBodyText = cleanText(bodyClone.text());
    const texts = uniqueStrings(
      [
        cleanText($('meta[name="description"]').attr('content') ?? ''),
        cleanText($('meta[property="og:description"]').attr('content') ?? ''),
        cleanText($('meta[name="twitter:description"]').attr('content') ?? ''),
        cleanText($('main p').slice(0, 6).text()),
        cleanText($('article p').slice(0, 6).text()),
        cleanText($('p').slice(0, 10).text()),
      ].filter((value) => value.length > 0),
    );
    const longDescription =
      texts.length > 0 ? truncate(texts.join('\n\n'), 5000) : null;

    const resolveUrl = (candidate: string): string | null => {
      const raw = cleanText(candidate);
      if (!raw) return null;
      try {
        return new URL(raw, pageUrl).toString();
      } catch {
        return null;
      }
    };

    const socialDomains = [
      'facebook.com',
      'instagram.com',
      'linkedin.com',
      'x.com',
      'twitter.com',
      'youtube.com',
      'tiktok.com',
    ];
    const socialLinks = uniqueStrings(
      $('a[href]')
        .map((_i, el) => resolveUrl($(el).attr('href') ?? ''))
        .get()
        .filter((href): href is string =>
          Boolean(
            href &&
              socialDomains.some((domain) => href.toLowerCase().includes(domain)),
          ),
        ),
    );

    const trustpilotUrl =
      uniqueStrings(
        $('a[href]')
          .map((_i, el) => resolveUrl($(el).attr('href') ?? ''))
          .get()
          .filter((href): href is string =>
            Boolean(href?.toLowerCase().includes('trustpilot.com')),
          ),
      )[0] ?? null;

    const mailtoEmails = $('a[href^="mailto:"]')
      .map((_i, el) => {
        const href = cleanText($(el).attr('href') ?? '');
        return href.replace(/^mailto:/i, '').split('?')[0];
      })
      .get()
      .filter((email) => email.length > 0);
    const textEmails =
      rawBodyText.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) ?? [];
    const telPhones = uniqueStrings(
      $('a[href^="tel:"]')
        .map((_i, el) => {
          const href = cleanText($(el).attr('href') ?? '');
          return href.replace(/^tel:/i, '').trim();
        })
        .get()
        .filter((value) => value.length > 0),
    );

    const textPhoneMatches =
      rawBodyText.match(/(?:\+?\d[\d\s\-()/]{5,}\d)/g) ?? [];
    const normalizedPhones = uniqueStrings(
      [...telPhones, ...textPhoneMatches]
        .map((value) => cleanText(value))
        .map((value) => value.replace(/^тел\.?\s*/i, '').trim())
        .filter((value) => value.length <= 40)
        .filter((value) => {
          const digits = value.replace(/\D/g, '').length;
          return digits >= 6 && digits <= 15;
        })
        .slice(0, 6),
    );
    const contactPhone = normalizedPhones.join('; ');
    const contactEmails = uniqueStrings(
      [...mailtoEmails, ...textEmails]
        .map((value) => cleanText(value).toLowerCase())
        .filter((value) =>
          /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value),
        )
        .slice(0, 10),
    );

    return {
      longDescription,
      logoUrl: null,
      socialLinks,
      trustpilotUrl,
      websiteEnrichedAt: new Date(),
      contactPhone: contactPhone.length > 0 ? contactPhone : null,
      contactEmails,
    };
  }

  private pushSyncLog(level: SyncLogLevel, message: string): void {
    const logs = [...this.latestSyncStatus.logs, { at: new Date().toISOString(), level, message }];
    this.latestSyncStatus = {
      ...this.latestSyncStatus,
      logs: logs.slice(-400),
    };
  }

  @Cron('0 3 * * *', { timeZone: 'Europe/Sofia' })
  async handleDailySync(): Promise<void> {
    const enabled =
      this.config.get<string>('FSC_AUTO_SYNC_ENABLED', 'true') !== 'false';
    if (!enabled) return;

    try {
      const result = await this.syncFromFsc();
      this.logger.log(
        `FSC daily sync completed: total=${result.total}, categories=${result.byCategory.length}`,
      );
    } catch (err) {
      this.logger.error('FSC daily sync failed', err);
    }
  }
}
