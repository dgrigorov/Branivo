import { Injectable, Logger } from '@nestjs/common';
import { promises as dns } from 'dns';

@Injectable()
export class DnsVerificationService {
  private readonly logger = new Logger(DnsVerificationService.name);

  /**
   * Checks if TXT record "_branivo-verify.{domain}" contains "branivo-verify={token}".
   * Uses Node.js built-in dns.promises — no npm package required.
   *
   * @param domain - the custom domain being verified (e.g. polici.mybrokerage.bg)
   * @param token  - the 64-char hex verification token stored in tenant_domains
   */
  async verifyTxtRecord(domain: string, token: string): Promise<boolean> {
    const recordName = `_branivo-verify.${domain}`;
    const expectedValue = `branivo-verify=${token}`;

    try {
      const records = await dns.resolveTxt(recordName);
      // resolveTxt returns string[][] — each TXT record is an array of string chunks
      return records.some((chunks) => chunks.join('') === expectedValue);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      // Expected DNS errors when record doesn't exist
      if (
        code === 'ENOTFOUND' ||
        code === 'ENODATA' ||
        code === 'ESERVFAIL' ||
        code === 'ETIMEOUT'
      ) {
        return false;
      }
      this.logger.warn(
        `DNS TXT lookup failed for ${recordName}: ${(err as Error).message}`,
      );
      return false;
    }
  }
}
