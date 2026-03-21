import { Injectable, Logger } from '@nestjs/common';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly cloudfrontDomain: string;

  constructor() {
    this.client = new S3Client({
      region: process.env.AWS_REGION ?? 'eu-central-1',
    });
    this.bucket = process.env.AWS_S3_BUCKET ?? '';
    this.cloudfrontDomain = process.env.AWS_CLOUDFRONT_DOMAIN ?? '';
  }

  /**
   * Upload tenant logo to S3.
   * S3 key: tenants/{tenantId}/logo.{ext}
   * Returns CloudFront URL.
   */
  async uploadLogo(
    tenantId: string,
    buffer: Buffer,
    ext: 'png' | 'svg',
  ): Promise<string> {
    const key = `tenants/${tenantId}/logo.${ext}`;
    const contentType = ext === 'svg' ? 'image/svg+xml' : 'image/png';

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000',
      }),
    );

    const url = `https://${this.cloudfrontDomain}/${key}`;
    this.logger.log(`Logo uploaded for tenant ${tenantId}: ${url}`);
    return url;
  }

  /**
   * Upload policy document to S3 (private — no ACL public-read).
   * Used for policy PDFs and green cards.
   */
  async uploadPolicyDocument(key: string, buffer: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: 'application/pdf',
      }),
    );
    this.logger.log(`Policy document uploaded: ${key}`);
  }

  /**
   * Generate a presigned URL for private S3 object download.
   * @param key S3 object key
   * @param expiresInSeconds TTL in seconds (e.g. 900 = 15 min)
   */
  async generatePresignedUrl(
    key: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }
}
