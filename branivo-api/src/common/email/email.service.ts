import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly fromAddress: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.getOrThrow<string>('SENDGRID_API_KEY');
    this.fromAddress = this.config.get<string>(
      'EMAIL_FROM',
      'noreply@branivo.bg',
    );

    this.transporter = nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: {
        user: 'apikey',
        pass: apiKey,
      },
    });
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
    const mailOptions: Mail.Options = {
      from: this.fromAddress,
      to,
      subject: `[Branivo OCR Alert] Поле "${field}" — fallback rate ${(fallbackRate * 100).toFixed(1)}%`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>⚠️ OCR Fallback Rate Alert</h2>
          <p>Полето <strong>${field}</strong> е надхвърлило прага от 20% за AWS Textract fallback.</p>
          <table style="width:100%; border-collapse:collapse; margin-top:16px;">
            <tr>
              <td style="padding:8px; border:1px solid #ddd;"><strong>Поле</strong></td>
              <td style="padding:8px; border:1px solid #ddd;">${field}</td>
            </tr>
            <tr>
              <td style="padding:8px; border:1px solid #ddd;"><strong>Fallback Rate</strong></td>
              <td style="padding:8px; border:1px solid #ddd; color:#dc2626;">${(fallbackRate * 100).toFixed(1)}%</td>
            </tr>
            <tr>
              <td style="padding:8px; border:1px solid #ddd;"><strong>Tenant ID</strong></td>
              <td style="padding:8px; border:1px solid #ddd;">${tenantId}</td>
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
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Добре дошли в Branivo!</h2>
        <p>Получихте покана да регистрирате брокерска организация <strong>${tenantName}</strong> в платформата Branivo.</p>
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
