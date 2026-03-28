import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { load } from 'cheerio';
import { Repository } from 'typeorm';
import { FscInsurerEntity } from './entities/fsc-insurer.entity';
import { WebsiteEnrichmentService } from './website-enrichment.service';
import { ParsedRow, WebsiteEnrichment } from './insurers.types';
import {
  cleanText,
  uniqueStrings,
  extractContactParts,
  hasText,
  isHeaderRow,
} from './insurers.utils';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15';

@Injectable()
export class FscScraperService {
  private readonly logger = new Logger(FscScraperService.name);

  constructor(
    @InjectRepository(FscInsurerEntity)
    private readonly repo: Repository<FscInsurerEntity>,
    private readonly websiteEnrichment: WebsiteEnrichmentService,
  ) {}

  async scrapeCategory(url: string): Promise<ParsedRow[]> {
    const response = await axios.get<string>(url, {
      timeout: 30000,
      headers: { 'User-Agent': USER_AGENT },
      responseType: 'text',
    });

    const $ = load(response.data);
    const rows: ParsedRow[] = [];

    let table = $('#myTable').first();
    if (table.length === 0) table = $('.wp-block-table table').first();
    if (table.length === 0) table = $('table').first();

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
      const mailtoEmails = (
        contactCell
          .find('a[href^="mailto:"]')
          .map((_i, el) => {
            const href = cleanText($(el).attr('href') ?? '');
            if (!href) return '';
            return href.replace(/^mailto:/i, '').split('?')[0];
          })
          .get() as string[]
      ).filter((email) => email.length > 0);

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

  async enrichRows(
    rows: ParsedRow[],
    cache: Map<string, WebsiteEnrichment>,
  ): Promise<Array<ParsedRow & WebsiteEnrichment>> {
    const limit = 6;
    const output: Array<ParsedRow & WebsiteEnrichment> = Array.from(
      { length: rows.length },
      () => ({}) as ParsedRow & WebsiteEnrichment,
    );
    let idx = 0;

    const worker = async (): Promise<void> => {
      while (idx < rows.length) {
        const current = idx++;
        const row = rows[current];
        const enrichment = await this.websiteEnrichment.enrich(
          row.website,
          cache,
        );
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

    await Promise.all(
      Array.from({ length: Math.min(limit, rows.length) }, worker),
    );
    return output;
  }

  deduplicateRows(
    rows: Array<ParsedRow & WebsiteEnrichment>,
  ): Array<ParsedRow & WebsiteEnrichment> {
    const seen = new Set<string>();
    const deduped: Array<ParsedRow & WebsiteEnrichment> = [];

    for (const row of rows) {
      const key = this.getDedupKey(row.name, row.eik);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(row);
    }

    return deduped;
  }

  getDedupKey(name: string, eik: string | null): string {
    return `${(eik ?? '').toLowerCase()}::${name.toLowerCase()}`;
  }

  buildMergedEntity(params: {
    existing?: FscInsurerEntity;
    scraped: ParsedRow & WebsiteEnrichment;
    categoryKey: string;
    categoryLabel: string;
    sourceUrl: string;
    now: Date;
  }): FscInsurerEntity {
    const { existing, scraped, categoryKey, categoryLabel, sourceUrl, now } =
      params;

    const pickStr = (
      a: string | null | undefined,
      b: string | null | undefined,
    ): string | null => (hasText(a) ? a : hasText(b) ? b : null);

    const pickArr = (
      a: string[] | null | undefined,
      b: string[] | null | undefined,
    ): string[] => {
      if (a && a.length > 0) return a;
      if (b && b.length > 0) return uniqueStrings(b);
      return [];
    };

    if (existing) {
      existing.categoryLabel = existing.categoryLabel || categoryLabel;
      existing.eik = pickStr(existing.eik, scraped.eik);
      existing.officeAddress = pickStr(
        existing.officeAddress,
        scraped.officeAddress,
      );
      existing.website = pickStr(existing.website, scraped.website);
      existing.contactDetails = pickStr(
        existing.contactDetails,
        scraped.contactDetails,
      );
      existing.contactPhone = pickStr(
        existing.contactPhone,
        scraped.contactPhone,
      );
      existing.contactEmails = pickArr(
        existing.contactEmails,
        scraped.contactEmails,
      );
      existing.longDescription = pickStr(
        existing.longDescription,
        scraped.longDescription,
      );
      existing.logoUrl = pickStr(existing.logoUrl, scraped.logoUrl);
      existing.socialLinks = pickArr(existing.socialLinks, scraped.socialLinks);
      existing.trustpilotUrl = pickStr(
        existing.trustpilotUrl,
        scraped.trustpilotUrl,
      );
      existing.websiteEnrichedAt =
        existing.websiteEnrichedAt ?? scraped.websiteEnrichedAt;
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
}
