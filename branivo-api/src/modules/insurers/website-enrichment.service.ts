import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { load } from 'cheerio';

type CheerioAPI = ReturnType<typeof load>;
import { WebsiteEnrichment } from './insurers.types';
import {
  cleanText,
  uniqueStrings,
  withHttps,
  truncate,
} from './insurers.utils';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15';

const SOCIAL_DOMAINS = [
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'x.com',
  'twitter.com',
  'youtube.com',
  'tiktok.com',
];

@Injectable()
export class WebsiteEnrichmentService {
  private readonly logger = new Logger(WebsiteEnrichmentService.name);

  async enrich(
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

    try {
      const normalizedUrl = withHttps(website);
      const parsed = new URL(normalizedUrl);
      const cacheKey = parsed.hostname.toLowerCase();
      const cached = cache.get(cacheKey);
      if (cached) return cached;

      const response = await axios.get<string>(parsed.toString(), {
        timeout: 12000,
        maxRedirects: 5,
        responseType: 'text',
        validateStatus: (status) => status >= 200 && status < 400,
        headers: { 'User-Agent': USER_AGENT },
      });

      const finalUrl =
        (response.request as { res?: { responseUrl?: string } } | undefined)
          ?.res?.responseUrl ?? parsed.toString();
      const enrichment = this.extractMetadata(response.data, finalUrl);
      cache.set(cacheKey, enrichment);
      return enrichment;
    } catch (err) {
      this.logger.debug(
        `Website enrichment skipped for "${website}": ${err instanceof Error ? err.message : 'unknown error'}`,
      );
      return empty;
    }
  }

  private extractMetadata(html: string, pageUrl: string): WebsiteEnrichment {
    const $ = load(html);
    const resolveUrl = this.makeUrlResolver(pageUrl);

    const rawBodyText = this.extractBodyText($);
    const longDescription = this.extractDescription($);
    const logoUrl = this.extractLogoUrl($, resolveUrl);
    const socialLinks = this.extractSocialLinks($, resolveUrl);
    const trustpilotUrl = this.extractTrustpilotUrl($, resolveUrl);
    const { contactPhone, contactEmails } = this.extractContactInfo(
      $,
      rawBodyText,
    );

    return {
      longDescription,
      logoUrl,
      socialLinks,
      trustpilotUrl,
      websiteEnrichedAt: new Date(),
      contactPhone,
      contactEmails,
    };
  }

  private makeUrlResolver(
    pageUrl: string,
  ): (candidate: string) => string | null {
    return (candidate: string): string | null => {
      const raw = cleanText(candidate);
      if (!raw) return null;
      try {
        return new URL(raw, pageUrl).toString();
      } catch {
        return null;
      }
    };
  }

  private extractBodyText($: CheerioAPI): string {
    const bodyClone = $('body').clone();
    bodyClone.find('script, style, noscript').remove();
    return cleanText(bodyClone.text());
  }

  private extractDescription($: CheerioAPI): string | null {
    const texts = uniqueStrings(
      [
        cleanText($('meta[name="description"]').attr('content') ?? ''),
        cleanText($('meta[property="og:description"]').attr('content') ?? ''),
        cleanText($('meta[name="twitter:description"]').attr('content') ?? ''),
        cleanText($('main p').slice(0, 6).text()),
        cleanText($('article p').slice(0, 6).text()),
        cleanText($('p').slice(0, 10).text()),
      ].filter((v) => v.length > 0),
    );
    return texts.length > 0 ? truncate(texts.join('\n\n'), 5000) : null;
  }

  private extractLogoUrl(
    $: CheerioAPI,
    resolveUrl: (c: string) => string | null,
  ): string | null {
    for (const el of $('script[type="application/ld+json"]').toArray()) {
      try {
        const parsed = JSON.parse($(el).html() ?? '') as unknown;
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (typeof item !== 'object' || item === null) continue;
          const field = (item as Record<string, unknown>)['logo'];
          if (typeof field === 'string' && field.length > 0) {
            const url = resolveUrl(field);
            if (url) return url;
          } else if (typeof field === 'object' && field !== null) {
            const urlVal = (field as Record<string, unknown>)['url'];
            if (typeof urlVal === 'string') {
              const url = resolveUrl(urlVal);
              if (url) return url;
            }
          }
        }
      } catch {
        /* skip malformed JSON-LD */
      }
    }

    const touchHref =
      $('link[rel="apple-touch-icon"][sizes="180x180"]').attr('href') ??
      $('link[rel="apple-touch-icon"][sizes="152x152"]').attr('href') ??
      $('link[rel="apple-touch-icon"]').first().attr('href');
    if (touchHref) return resolveUrl(touchHref);

    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) return resolveUrl(ogImage);

    return null;
  }

  private extractSocialLinks(
    $: CheerioAPI,
    resolveUrl: (c: string) => string | null,
  ): string[] {
    const hrefs = $('a[href]')
      .map((_i, el) => resolveUrl($(el).attr('href') ?? ''))
      .get() as (string | null)[];
    return uniqueStrings(
      hrefs.filter((href): href is string =>
        Boolean(
          href && SOCIAL_DOMAINS.some((d) => href.toLowerCase().includes(d)),
        ),
      ),
    );
  }

  private extractTrustpilotUrl(
    $: CheerioAPI,
    resolveUrl: (c: string) => string | null,
  ): string | null {
    const hrefs = $('a[href]')
      .map((_i, el) => resolveUrl($(el).attr('href') ?? ''))
      .get() as (string | null)[];
    return (
      uniqueStrings(
        hrefs.filter((href): href is string =>
          Boolean(href?.toLowerCase().includes('trustpilot.com')),
        ),
      )[0] ?? null
    );
  }

  private extractContactInfo(
    $: CheerioAPI,
    rawBodyText: string,
  ): { contactPhone: string | null; contactEmails: string[] } {
    const mailtoEmails = (
      $('a[href^="mailto:"]')
        .map((_i, el) => {
          const href = cleanText($(el).attr('href') ?? '');
          return href.replace(/^mailto:/i, '').split('?')[0];
        })
        .get() as string[]
    ).filter((e) => e.length > 0);

    const textEmails: string[] =
      rawBodyText.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) ?? [];
    const contactEmails = uniqueStrings(
      [...mailtoEmails, ...textEmails]
        .map((v) => cleanText(v).toLowerCase())
        .filter((v) => /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(v))
        .slice(0, 10),
    );

    const telPhones = uniqueStrings(
      (
        $('a[href^="tel:"]')
          .map((_i, el) =>
            cleanText($(el).attr('href') ?? '')
              .replace(/^tel:/i, '')
              .trim(),
          )
          .get() as string[]
      ).filter((v) => v.length > 0),
    );

    const textPhones = rawBodyText.match(/(?:\+?\d[\d\s\-()/]{5,}\d)/g) ?? [];
    const contactPhone =
      uniqueStrings(
        [...telPhones, ...textPhones]
          .map((v) =>
            cleanText(v)
              .replace(/^тел\.?\s*/i, '')
              .trim(),
          )
          .filter((v) => v.length <= 40)
          .filter((v) => {
            const d = v.replace(/\D/g, '').length;
            return d >= 6 && d <= 15;
          })
          .slice(0, 6),
      ).join('; ') || null;

    return { contactPhone, contactEmails };
  }
}
