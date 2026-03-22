import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import PDFDocument from 'pdfkit';
import { PoliciesRepository } from './policies.repository';
import { PolicyEventsRepository } from './policy-events.repository';
import { PolicyEventType } from './entities/policy-event.entity';
import { Policy } from './entities/policy.entity';
import { S3Service } from '../../infrastructure/s3/s3.service';
import { EmailService } from '../../infrastructure/email/email.service';
import type { PdfGenerationJobPayload } from '../payments/stripe-webhook.service';
import { EndClient } from '../clients/entities/end-client.entity';
import { Insurer } from '../quotes/entities/insurer.entity';

@Injectable()
export class PdfGenerationService {
  private readonly logger = new Logger(PdfGenerationService.name);

  constructor(
    @InjectRepository(Policy)
    private readonly policyRepo: Repository<Policy>,
    private readonly policiesRepo: PoliciesRepository,
    private readonly policyEventsRepo: PolicyEventsRepository,
    private readonly s3Service: S3Service,
    private readonly emailService: EmailService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async generateAndDeliverDocuments(
    payload: PdfGenerationJobPayload,
  ): Promise<void> {
    const { policyId, tenantId, endClientId } = payload;

    // 1. Вземи policy без tenant scope (job context)
    const policy = await this.policyRepo.findOne({
      where: { id: policyId, deletedAt: IsNull() },
    });
    if (!policy) {
      this.logger.error(`Policy not found: ${policyId}`);
      throw new Error(`Policy not found: ${policyId}`);
    }

    // 2. Вземи end_client email ако endClientId е наличен
    let clientEmail: string | undefined;
    if (endClientId) {
      const client = await this.dataSource
        .getRepository(EndClient)
        .findOne({ where: { id: endClientId, deletedAt: IsNull() } });
      const clientWithEmail = client as (EndClient & { email?: string }) | null;
      clientEmail = clientWithEmail?.email;
    }

    // 3. Вземи insurer name за PDF съдържание
    const insurer = await this.dataSource
      .getRepository(Insurer)
      .findOne({ where: { id: policy.insurerId, deletedAt: IsNull() } });
    const insurerName = insurer?.name ?? 'Застраховател';

    // 4. Генерирай PDF буфери
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    const policyPdfBuffer = await this.generatePolicyPdf(policy, insurerName);
    const greenCardBuffer = await this.generateGreenCardPdf(
      policy,
      insurerName,
    );

    // 5. Изчисли S3 ключове
    const policyS3Key = `${tenantId}/${year}/${month}/policy/${policyId}.pdf`;
    const greenCardS3Key = `${tenantId}/${year}/${month}/green-card/${policyId}.pdf`;

    // 6. Upload двата файла в S3
    await this.s3Service.uploadPolicyDocument(policyS3Key, policyPdfBuffer);
    await this.s3Service.uploadPolicyDocument(greenCardS3Key, greenCardBuffer);

    // 7. Update policy record с S3 ключове
    await this.policiesRepo.updatePdfKeys(
      policyId,
      policyS3Key,
      greenCardS3Key,
    );

    // 8. Генерирай presigned URLs (TTL 900 сек = 15 мин)
    const policyPdfUrl = await this.s3Service.generatePresignedUrl(
      policyS3Key,
      900,
    );
    const greenCardUrl = await this.s3Service.generatePresignedUrl(
      greenCardS3Key,
      900,
    );

    // 9. Изпрати имейл ако имаме email адрес
    if (clientEmail) {
      await this.emailService.sendPolicyDocuments({
        to: clientEmail,
        policyNumber: policy.policyNumber,
        policyPdfUrl,
        greenCardUrl,
        tenantName: tenantId,
      });

      // 10. Update documentsEmailedAt
      await this.policiesRepo.markDocumentsEmailed(policyId);
    } else {
      this.logger.warn(
        `No email for policy ${policyId} (endClientId: ${endClientId ?? 'none'}) — skipping email delivery`,
      );
    }

    // 11. Създай immutable policy_events запис
    await this.policyEventsRepo.createEvent({
      tenantId,
      policyId,
      eventType: PolicyEventType.DOCUMENTS_DELIVERED,
      payload: {
        policyPdfS3Key: policyS3Key,
        greenCardS3Key,
        emailSent: !!clientEmail,
        deliveredAt: new Date().toISOString(),
      },
    });

    this.logger.log(`Documents generated and delivered for policy ${policyId}`);
  }

  /**
   * Generate policy PDF and upload to S3 without email delivery.
   * Used for batch PDF export (fleet feature).
   * Returns the S3 key of the uploaded PDF.
   */
  async generateAndUploadPolicyPdf(
    policyId: string,
    tenantId: string,
  ): Promise<string> {
    const policy = await this.policyRepo.findOne({
      where: { id: policyId, deletedAt: IsNull() },
    });
    if (!policy) throw new Error(`Policy not found: ${policyId}`);

    const insurer = await this.dataSource
      .getRepository(Insurer)
      .findOne({ where: { id: policy.insurerId, deletedAt: IsNull() } });
    const insurerName = insurer?.name ?? 'Застраховател';

    const buffer = await this.generatePolicyPdf(policy, insurerName);

    const now = new Date();
    const year = now.getFullYear().toString();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const s3Key = `${tenantId}/${year}/${month}/policy/${policyId}.pdf`;

    await this.s3Service.uploadPolicyDocument(s3Key, buffer);
    await this.policiesRepo.updatePdfKeys(policyId, s3Key, s3Key);

    return s3Key;
  }

  private generatePolicyPdf(
    policy: Policy,
    insurerName: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      doc.fontSize(20).text('ЗАСТРАХОВАТЕЛНА ПОЛИЦА', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12);
      doc.text(`Номер на полица: ${policy.policyNumber}`);
      doc.text(`Статус: АКТИВНА`);
      doc.text(`Застрахователна компания: ${insurerName}`);
      if (policy.coverageStartDate && policy.coverageEndDate) {
        doc.text(
          `Период: ${String(policy.coverageStartDate)} — ${String(policy.coverageEndDate)}`,
        );
      }
      doc.text(`Сума: ${String(policy.premiumAmount)} ${policy.currency}`);
      doc.end();
    });
  }

  private generateGreenCardPdf(
    policy: Policy,
    insurerName: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      doc.fontSize(20).text('ЗЕЛЕНА КАРТА / GREEN CARD', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12);
      doc.text(`Policy Number: ${policy.policyNumber}`);
      doc.text(`Insurer: ${insurerName}`);
      if (policy.coverageStartDate && policy.coverageEndDate) {
        doc.text(
          `Period: ${String(policy.coverageStartDate)} — ${String(policy.coverageEndDate)}`,
        );
      }
      doc.end();
    });
  }
}
