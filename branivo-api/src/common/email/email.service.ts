import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly fromAddress: string;

  constructor(private readonly config: ConfigService) {
    this.fromAddress = this.config.get<string>(
      'EMAIL_FROM',
      'noreply@branivo.bg',
    );

    const isDev = this.config.get<string>('NODE_ENV') !== 'production';
    const sendgridKey = this.config.get<string>('SENDGRID_API_KEY');

    if (!isDev && !sendgridKey) {
      throw new Error('SENDGRID_API_KEY is required in production');
    }

    if (!isDev && sendgridKey) {
      this.transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        auth: { user: 'apikey', pass: sendgridKey },
      });
    } else {
      this.transporter = nodemailer.createTransport({
        host: this.config.get<string>('SMTP_HOST', 'localhost'),
        port: this.config.get<number>('SMTP_PORT', 1025),
        secure: false,
        ignoreTLS: true,
      });
    }
  }

  async sendOnboardingInvite(
    email: string,
    token: string,
    tenantName: string,
  ): Promise<void> {
    const frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      'https://onboarding.branivo.bg',
    );
    const link = `${frontendUrl}/onboarding?token=${token}`;

    const mailOptions: Mail.Options = {
      from: this.fromAddress,
      to: email,
      subject: 'Поканен сте да се регистрирате в Branivo',
      html: this.buildOnboardingEmailHtml(tenantName, link),
    };

    await this.sendWithRetry(mailOptions);
  }

  async sendOcrAlertEmail(
    to: string,
    field: string,
    fallbackRate: number,
    tenantId: string,
  ): Promise<void> {
    const safeField = escapeHtml(field);
    const safeTenantId = escapeHtml(tenantId);
    const mailOptions: Mail.Options = {
      from: this.fromAddress,
      to,
      subject: `[Branivo OCR Alert] Поле "${safeField}" — fallback rate ${(fallbackRate * 100).toFixed(1)}%`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>⚠️ OCR Fallback Rate Alert</h2>
          <p>Полето <strong>${safeField}</strong> е надхвърлило прага от 20% за AWS Textract fallback.</p>
          <table style="width:100%; border-collapse:collapse; margin-top:16px;">
            <tr>
              <td style="padding:8px; border:1px solid #ddd;"><strong>Поле</strong></td>
              <td style="padding:8px; border:1px solid #ddd;">${safeField}</td>
            </tr>
            <tr>
              <td style="padding:8px; border:1px solid #ddd;"><strong>Fallback Rate</strong></td>
              <td style="padding:8px; border:1px solid #ddd; color:#dc2626;">${(fallbackRate * 100).toFixed(1)}%</td>
            </tr>
            <tr>
              <td style="padding:8px; border:1px solid #ddd;"><strong>Tenant ID</strong></td>
              <td style="padding:8px; border:1px solid #ddd;">${safeTenantId}</td>
            </tr>
          </table>
          <p style="color:#666; font-size:14px; margin-top:16px;">
            Отворете OCR Analytics Dashboard за детайли.
          </p>
        </div>
      `,
    };

    await this.sendWithRetry(mailOptions);
  }

  async sendInactivityAlert(
    to: string,
    tenantName: string,
    inactiveDays: number,
  ): Promise<void> {
    const safeName = escapeHtml(tenantName);
    const mailOptions: Mail.Options = {
      from: this.fromAddress,
      to,
      subject: `[Branivo] Неактивен тенант: ${safeName} (${inactiveDays} дни)`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>⚠️ Tenant Inactivity Alert</h2>
          <p>Тенантът <strong>${safeName}</strong> не е продал полица от <strong>${inactiveDays} дни</strong>.</p>
          <p>Влезте в Platform Health Dashboard за повече детайли.</p>
          <p style="color: #666; font-size: 14px;">Branivo Super Admin система</p>
        </div>
      `,
    };

    await this.sendWithRetry(mailOptions);
  }

  async sendDowngradeNotification(
    to: string,
    affectedFlags: string[],
    graceEndsAt: string,
  ): Promise<void> {
    const dateStr = new Date(graceEndsAt).toLocaleDateString('bg-BG');
    const flagList =
      affectedFlags.length > 0 ? affectedFlags.join(', ') : 'Няма';
    const subject = `Branivo: Планът ви се downgrade-ва на ${dateStr}`;
    const text = [
      `Вашият абонаментен план ще бъде понижен на ${dateStr}.`,
      `Features за деактивиране: ${flagList}.`,
      `За да запазите достъпа, надстройте плана си преди тази дата.`,
    ].join('\n');
    await this.sendWithRetry({ from: this.fromAddress, to, subject, text });
  }

  async sendSystemNotification(params: {
    to: string;
    type: 'info' | 'warning' | 'critical';
    message: string;
  }): Promise<void> {
    const subject = `[${params.type.toUpperCase()}] System Notification — Branivo`;
    const safeMessage = escapeHtml(params.message);
    const text = `${subject}\n\n${safeMessage}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>System Notification</h2>
        <p><strong>Type:</strong> ${escapeHtml(params.type)}</p>
        <p>${safeMessage}</p>
        <p>— Branivo Platform</p>
      </div>
    `;
    await this.sendWithRetry({
      from: this.fromAddress,
      to: params.to,
      subject,
      text,
      html,
    });
  }

  async sendInsurerAlertEmail(
    to: string,
    insurerName: string,
    errorRate: number,
    avgLatencyMs: number,
  ): Promise<void> {
    const safeName = escapeHtml(insurerName);
    const mailOptions: Mail.Options = {
      from: this.fromAddress,
      to,
      subject: `[Branivo] Insurer API Alert: ${safeName} — error rate ${errorRate.toFixed(2)}%`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>⚠️ Insurer API High Error Rate</h2>
          <p>Застрахователят <strong>${safeName}</strong> е надхвърлил прага от 1% грешки за последните 5 минути.</p>
          <table style="width:100%; border-collapse:collapse; margin-top:16px;">
            <tr>
              <td style="padding:8px; border:1px solid #ddd;"><strong>Застраховател</strong></td>
              <td style="padding:8px; border:1px solid #ddd;">${safeName}</td>
            </tr>
            <tr>
              <td style="padding:8px; border:1px solid #ddd;"><strong>Error Rate (5мин)</strong></td>
              <td style="padding:8px; border:1px solid #ddd; color:#dc2626;">${errorRate.toFixed(2)}%</td>
            </tr>
            <tr>
              <td style="padding:8px; border:1px solid #ddd;"><strong>Avg Latency</strong></td>
              <td style="padding:8px; border:1px solid #ddd;">${Math.round(avgLatencyMs)} ms</td>
            </tr>
          </table>
          <p style="margin-top:16px;">
            Отворете <a href="#">Insurer API Dashboard</a> за да активирате manual fallback ако е необходимо.
          </p>
          <p style="color: #666; font-size: 14px;">Branivo Super Admin система</p>
        </div>
      `,
    };

    await this.sendWithRetry(mailOptions);
  }

  private async sendWithRetry(
    options: Mail.Options,
    maxRetries = 3,
  ): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.transporter.sendMail(options);
        return;
      } catch (err) {
        this.logger.error(
          `Email send attempt ${attempt}/${maxRetries} failed`,
          err,
        );
        if (attempt === maxRetries) {
          throw err;
        }
      }
    }
  }

  private buildOnboardingEmailHtml(tenantName: string, link: string): string {
    const safeTenantName = escapeHtml(tenantName);
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Добре дошли в Branivo!</h2>
        <p>Получихте покана да регистрирате брокерска организация <strong>${safeTenantName}</strong> в платформата Branivo.</p>
        <p>Натиснете бутона по-долу, за да завършите регистрацията:</p>
        <a href="${link}" style="
          display: inline-block;
          background-color: #1A56DB;
          color: white;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 4px;
          margin: 16px 0;
        ">Регистрирайте се сега</a>
        <p style="color: #666; font-size: 14px;">Линкът е валиден 48 часа. Ако не сте очаквали тази покана, игнорирайте имейла.</p>
      </div>
    `;
  }
}
