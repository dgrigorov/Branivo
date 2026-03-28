export function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function uniqueStrings(values: string[]): string[] {
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

export function extractContactParts(
  contactDetailsRaw: string,
  additionalEmails: string[] = [],
): { contactPhone: string | null; contactEmails: string[] } {
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
    .replace(/\s*(або|or)\s*/gi, '; ')
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

export function withHttps(url: string): string {
  const trimmed = cleanText(url);
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

export function truncate(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen - 1)}…`;
}

export function hasText(value: string | null | undefined): value is string {
  return Boolean(value && cleanText(value).length > 0);
}

export function isHeaderRow(firstCellText: string): boolean {
  const normalized = cleanText(firstCellText).toLowerCase();
  return (
    normalized.includes('наименование') ||
    normalized.includes('ime') ||
    normalized.includes('eik') ||
    normalized.includes('еик')
  );
}
