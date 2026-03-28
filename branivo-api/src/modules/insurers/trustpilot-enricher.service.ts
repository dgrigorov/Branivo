import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { load } from 'cheerio';
import { IsNull, Repository } from 'typeorm';
import { FscInsurerEntity } from './entities/fsc-insurer.entity';
import { withHttps } from './insurers.utils';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15';

@Injectable()
export class TrustpilotEnricherService {
  private readonly logger = new Logger(TrustpilotEnricherService.name);

  constructor(
    @InjectRepository(FscInsurerEntity)
    private readonly repo: Repository<FscInsurerEntity>,
  ) {}

  async enrichAll(): Promise<{
    enriched: number;
    failed: number;
    skipped: number;
  }> {
    const rows = await this.repo.find({ where: { deletedAt: IsNull() } });
    let enriched = 0;
    let failed = 0;
    let skipped = 0;
    const toSave: FscInsurerEntity[] = [];

    for (const row of rows) {
      const domain = this.getDomain(row.website);
      if (!domain) {
        skipped++;
        continue;
      }

      try {
        const data = await this.fetchData(domain, row.name);
        if (!data) {
          skipped++;
          continue;
        }

        row.trustpilotUrl = data.url;
        row.trustpilotScore = data.score;
        row.trustpilotReviewsCount = data.reviewsCount;
        row.trustpilotEnrichedAt = new Date();
        toSave.push(row);
        enriched++;
      } catch (err) {
        this.logger.debug(
          `Trustpilot enrich failed for "${row.name}": ${
            err instanceof Error ? err.message : 'unknown'
          }`,
        );
        failed++;
      }
    }

    if (toSave.length > 0) {
      await this.repo.save(toSave);
    }

    this.logger.log(
      `Trustpilot enrich done: enriched=${enriched}, failed=${failed}, skipped=${skipped}`,
    );
    return { enriched, failed, skipped };
  }

  getDomain(website: string | null): string | null {
    if (!website) return null;
    try {
      return new URL(withHttps(website)).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  private async fetchData(
    domain: string,
    companyName: string,
  ): Promise<{ url: string; score: number; reviewsCount: number } | null> {
    const directUrl = `https://www.trustpilot.com/review/${domain}`;
    const direct = await this.scrapePage(directUrl);
    if (direct) return { url: directUrl, ...direct };

    const searchResult = await this.findViaSearch(companyName, domain);
    if (!searchResult) return null;

    const fromSearch = await this.scrapePage(searchResult);
    if (fromSearch) return { url: searchResult, ...fromSearch };

    return null;
  }

  private async scrapePage(
    url: string,
  ): Promise<{ score: number; reviewsCount: number } | null> {
    try {
      const response = await axios.get<string>(url, {
        timeout: 10_000,
        maxRedirects: 3,
        responseType: 'text',
        validateStatus: (s) => s === 200,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      const $ = load(response.data);
      for (const el of $('script[type="application/ld+json"]').toArray()) {
        try {
          const parsed = JSON.parse($(el).html() ?? '') as unknown;
          const items = Array.isArray(parsed) ? parsed : [parsed];
          for (const item of items) {
            if (typeof item !== 'object' || item === null) continue;
            const aggRating = (item as Record<string, unknown>)[
              'aggregateRating'
            ];
            if (typeof aggRating !== 'object' || aggRating === null) continue;
            const agg = aggRating as Record<string, unknown>;
            const rv = agg['ratingValue'];
            const rc = agg['reviewCount'];
            const score = parseFloat(
              typeof rv === 'string' || typeof rv === 'number'
                ? String(rv)
                : '',
            );
            const reviewsCount = parseInt(
              typeof rc === 'string' || typeof rc === 'number'
                ? String(rc)
                : '',
              10,
            );
            if (!isNaN(score) && score > 0 && !isNaN(reviewsCount)) {
              return { score, reviewsCount };
            }
          }
        } catch {
          /* skip malformed JSON-LD */
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private async findViaSearch(
    companyName: string,
    domain: string,
  ): Promise<string | null> {
    const searchUrl = `https://www.trustpilot.com/search?query=${encodeURIComponent(companyName)}`;
    try {
      const response = await axios.get<string>(searchUrl, {
        timeout: 8_000,
        maxRedirects: 3,
        responseType: 'text',
        validateStatus: (s) => s === 200,
        headers: { 'User-Agent': USER_AGENT },
      });

      const $ = load(response.data);
      const companySlug = domain.split('.')[0].toLowerCase();
      let bestMatch: string | null = null;

      $('a[href^="/review/"]').each((_, el) => {
        if (bestMatch) return;
        const href = $(el).attr('href') ?? '';
        const slug = href.replace('/review/', '').split('/')[0].toLowerCase();
        if (slug.includes(companySlug) || companySlug.includes(slug)) {
          bestMatch = `https://www.trustpilot.com${href}`;
        }
      });

      return bestMatch;
    } catch {
      return null;
    }
  }
}
