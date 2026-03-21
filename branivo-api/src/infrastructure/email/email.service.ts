import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

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
}
