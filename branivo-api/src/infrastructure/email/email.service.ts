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
  readonly transporter: nodemailer.Transporter;

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

  async sendPasswordResetEmail(params: {
    to: string;
    resetToken: string;
    tenantId: string;
  }): Promise<void> {
    const resetUrl = `${process.env.APP_BASE_URL ?? 'https://app.branivo.bg'}/reset-password?token=${params.resetToken}`;

    await this.transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'noreply@branivo.com',
      to: params.to,
      subject: 'Смяна на парола — Branivo',
      html: `
        <h2>Смяна на парола</h2>
        <p>Получихте това писмо, защото е поискана смяна на парола за вашия акаунт.</p>
        <p>Кликнете на линка по-долу за да смените паролата си (валиден 15 минути):</p>
        <p><a href="${resetUrl}">Смяна на парола</a></p>
        <p>Ако не сте поискали смяна на парола, игнорирайте това писмо — акаунтът ви е в безопасност.</p>
        <p>— Branivo</p>
      `,
    });

    this.logger.log(`Password reset email sent to ${params.to}`);
  }

  async sendDataExportRequestedEmail(params: {
    to: string;
    tenantId: string;
  }): Promise<void> {
    const { to } = params;

    await this.transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'noreply@branivo.com',
      to,
      subject: 'Заявката ви за лични данни е получена — Branivo',
      html: `
        <h2>Заявка за лични данни</h2>
        <p>Здравейте,</p>
        <p>Вашият data export се подготвя. Ще получите линк за изтегляне в рамките на 24 часа.</p>
        <p>— Branivo</p>
      `,
    });

    this.logger.log(`Data export requested email sent to ${to}`);
  }

  async sendDataExportReadyEmail(params: {
    to: string;
    downloadUrl: string;
    expiresAt: Date;
    tenantId: string;
  }): Promise<void> {
    const { to, downloadUrl, expiresAt } = params;
    const safeUrl = this.escapeHtml(downloadUrl);
    const expiresAtStr = expiresAt.toLocaleString('bg-BG', {
      timeZone: 'Europe/Sofia',
    });

    await this.transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'noreply@branivo.com',
      to,
      subject: 'Данните ви са готови за изтегляне — Branivo',
      html: `
        <h2>Вашите лични данни са готови</h2>
        <p>Здравейте,</p>
        <p>Вашият data export е готов. Изтеглете го от следния линк (валиден до ${expiresAtStr}):</p>
        <p><a href="${safeUrl}">Изтегли личните ми данни</a></p>
        <p>— Branivo</p>
      `,
    });

    this.logger.log(`Data export ready email sent to ${to}`);
  }

  async sendRenewalFailureAlert(params: {
    to: string;
    errorMessage: string;
  }): Promise<void> {
    const { to, errorMessage } = params;

    const safeError = errorMessage
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    await this.transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'noreply@branivo.com',
      to,
      subject: `⚠️ Renewal check job failed`,
      html: `
        <h2>Renewal Check Job Failure Alert</h2>
        <p>The daily renewal check job has failed and been moved to the dead-letter queue.</p>
        <p><strong>Error:</strong> ${safeError}</p>
        <p>Please check the BullMQ dead-letter queue and investigate.</p>
        <p>— Branivo Platform</p>
      `,
    });

    this.logger.warn(`Renewal failure alert sent to ${to}`);
  }
}
