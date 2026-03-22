import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../../../infrastructure/email/email.service';

export interface EmailNotificationParams {
  to: string;
  subject: string;
  html: string;
  tenantName: string;
}

@Injectable()
export class EmailChannel {
  constructor(
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  async send(params: EmailNotificationParams): Promise<void> {
    await this.emailService.transporter.sendMail({
      from:
        this.config.get<string>('SMTP_FROM') ??
        `${params.tenantName} <noreply@branivo.com>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
  }
}
