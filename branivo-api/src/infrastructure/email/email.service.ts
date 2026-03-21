import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';

export interface SendPolicyDocumentsParams {
  to: string;
  policyNumber: string;
  policyPdfUrl: string;
  greenCardUrl: string;
  tenantName: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'localhost',
      port: Number(process.env.SMTP_PORT ?? 1025),
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
  }

  async sendPolicyDocuments(params: SendPolicyDocumentsParams): Promise<void> {
    const { to, policyNumber, policyPdfUrl, greenCardUrl, tenantName } = params;

    await this.transporter.sendMail({
      from: process.env.SMTP_FROM ?? `${tenantName} <noreply@branivo.com>`,
      to,
      subject: `Вашата полица ${policyNumber} е готова`,
      html: `
        <h2>Здравейте!</h2>
        <p>Вашата полица <strong>${policyNumber}</strong> е активирана.</p>
        <p>Можете да изтеглите документите си от следните линкове (валидни 15 минути):</p>
        <ul>
          <li><a href="${policyPdfUrl}">Полица (PDF)</a></li>
          <li><a href="${greenCardUrl}">Зелена карта (PDF)</a></li>
        </ul>
        <p>Поздрави,<br>${tenantName}</p>
      `,
    });

    this.logger.log(
      `Policy documents email sent to ${to} for policy ${policyNumber}`,
    );
  }

  async sendInvoiceEmail(params: {
    to: string;
    tenantName: string;
    periodLabel: string;
    policiesCount: number;
    totalPremium: number;
    platformFee: number;
    subscriptionFee: number;
    amountDue: number;
    isProRata: boolean;
  }): Promise<void> {
    const {
      to,
      tenantName,
      periodLabel,
      policiesCount,
      totalPremium,
      platformFee,
      subscriptionFee,
      amountDue,
      isProRata,
    } = params;

    const pdfBuffer = await this.generateInvoicePdf(params);

    await this.transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'billing@branivo.com',
      to,
      subject: `Фактура за ${periodLabel} — Branivo`,
      html: `
        <h2>Фактура за ${periodLabel}</h2>
        <p>Здравейте,</p>
        <p>Прилагаме фактурата за <strong>${tenantName}</strong> за период <strong>${periodLabel}</strong>.</p>
        <table style="border-collapse:collapse;width:100%;max-width:480px">
          <tr><td style="padding:4px 8px">Полици:</td><td style="padding:4px 8px"><strong>${policiesCount}</strong></td></tr>
          <tr><td style="padding:4px 8px">Обща премия:</td><td style="padding:4px 8px">${totalPremium.toFixed(2)} BGN</td></tr>
          <tr><td style="padding:4px 8px">Platform fee:</td><td style="padding:4px 8px">${platformFee.toFixed(2)} BGN</td></tr>
          <tr><td style="padding:4px 8px">Абонаментна такса${isProRata ? ' (pro-rata)' : ''}:</td><td style="padding:4px 8px">${subscriptionFee.toFixed(2)} BGN</td></tr>
          <tr style="font-weight:bold"><td style="padding:4px 8px;border-top:1px solid #ccc">Дължима сума:</td><td style="padding:4px 8px;border-top:1px solid #ccc">${amountDue.toFixed(2)} BGN</td></tr>
        </table>
        <p>Фактурата е прикачена в PDF формат.</p>
        <p>Поздрави,<br>Branivo Platform</p>
      `,
      attachments: [
        {
          filename: `invoice-${periodLabel}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    this.logger.log(`Invoice email sent to ${to} for period ${periodLabel}`);
  }

  private generateInvoicePdf(params: {
    tenantName: string;
    periodLabel: string;
    policiesCount: number;
    totalPremium: number;
    platformFee: number;
    subscriptionFee: number;
    amountDue: number;
    isProRata: boolean;
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).text('Фактура — Branivo Platform', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Тенант: ${params.tenantName}`);
      doc.text(`Период: ${params.periodLabel}`);
      doc.moveDown();
      doc.text(`Полици: ${params.policiesCount}`);
      doc.text(`Обща премия: ${params.totalPremium.toFixed(2)} BGN`);
      doc.text(`Platform fee: ${params.platformFee.toFixed(2)} BGN`);
      doc.text(
        `Абонаментна такса${params.isProRata ? ' (pro-rata)' : ''}: ${params.subscriptionFee.toFixed(2)} BGN`,
      );
      doc.moveDown();
      doc
        .fontSize(14)
        .text(`Дължима сума: ${params.amountDue.toFixed(2)} BGN`, {
          underline: true,
        });

      doc.end();
    });
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async sendStripeRevocationEmail(params: {
    to: string;
    tenantName: string;
    isRevoked: boolean;
    stripeAccountId: string;
  }): Promise<void> {
    const { to, isRevoked } = params;
    const tenantName = this.escapeHtml(params.tenantName);
    const stripeAccountId = this.escapeHtml(params.stripeAccountId);

    const subject = isRevoked
      ? `⚠️ Вашият Stripe акаунт е спрян — нови продажби са блокирани`
      : `✅ Вашият Stripe акаунт е възстановен — продажбите са възобновени`;

    const html = isRevoked
      ? `
        <h2>⚠️ Вашият Stripe акаунт е спрян</h2>
        <p>Здравейте,</p>
        <p>Stripe акаунтът на <strong>${tenantName}</strong> (${stripeAccountId}) е временно спрян и <strong>нови продажби са блокирани</strong>.</p>
        <p>Съществуващите издадени полици остават достъпни.</p>
        <p>Моля, свържете се с Stripe Support за да разрешите проблема и възстановите акаунта си.</p>
        <p>— Branivo Platform</p>
      `
      : `
        <h2>✅ Вашият Stripe акаунт е възстановен</h2>
        <p>Здравейте,</p>
        <p>Stripe акаунтът на <strong>${tenantName}</strong> (${stripeAccountId}) е успешно възстановен.</p>
        <p>Нови продажби са вече възобновени.</p>
        <p>— Branivo Platform</p>
      `;

    await this.transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'noreply@branivo.com',
      to,
      subject,
      html,
    });

    this.logger.log(
      `Stripe revocation email (isRevoked=${String(isRevoked)}) sent to ${to} for tenant ${tenantName}`,
    );
  }

  async sendBillingFailureAlert(params: {
    to: string;
    tenantId: string;
    errorMessage: string;
  }): Promise<void> {
    const { to, tenantId, errorMessage } = params;

    await this.transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'noreply@branivo.com',
      to,
      subject: `⚠️ Billing job failed for tenant ${tenantId}`,
      html: `
        <h2>Billing Job Failure Alert</h2>
        <p>Invoice generation failed for tenant <strong>${tenantId}</strong>.</p>
        <p><strong>Error:</strong> ${errorMessage}</p>
        <p>Please check the BullMQ dead-letter queue and investigate.</p>
        <p>— Branivo Platform</p>
      `,
    });

    this.logger.warn(
      `Billing failure alert sent to ${to} for tenant ${tenantId}`,
    );
  }
}
