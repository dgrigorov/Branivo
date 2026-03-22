import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailChannel, EmailNotificationParams } from './email.channel';

export interface SmsNotificationParams {
  phoneNumber: string;
  message: string;
  fallbackEmail?: string | null;
  emailSubject?: string;
  emailBody?: string;
  tenantName?: string;
}

export interface SmsResult {
  status: 'sent' | 'sms_failed';
  fallbackUsed: boolean;
}

@Injectable()
export class SmsChannel {
  private readonly logger = new Logger(SmsChannel.name);

  constructor(
    private readonly config: ConfigService,
    private readonly emailChannel: EmailChannel,
  ) {}

  async send(params: SmsNotificationParams): Promise<SmsResult> {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const fromNumber = this.config.get<string>('TWILIO_PHONE_NUMBER');

    if (!accountSid || !authToken || !fromNumber) {
      this.logger.warn('Twilio not configured — falling back');
      return this.handleFallback(params);
    }

    try {
      const credentials = Buffer.from(`${accountSid}:${authToken}`).toString(
        'base64',
      );
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: params.phoneNumber,
            From: fromNumber,
            Body: params.message,
          }).toString(),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Twilio SMS failed: ${response.status} ${errorText}`);
        return this.handleFallback(params);
      }

      return { status: 'sent', fallbackUsed: false };
    } catch (err) {
      this.logger.error('Twilio request error', err);
      return this.handleFallback(params);
    }
  }

  private async handleFallback(
    params: SmsNotificationParams,
  ): Promise<SmsResult> {
    if (params.fallbackEmail && params.emailBody) {
      const emailParams: EmailNotificationParams = {
        to: params.fallbackEmail,
        subject: params.emailSubject ?? 'Известие за подновяване на полица',
        html: params.emailBody,
        tenantName: params.tenantName ?? 'Branivo',
      };
      await this.emailChannel.send(emailParams);
      return { status: 'sms_failed', fallbackUsed: true };
    }
    return { status: 'sms_failed', fallbackUsed: false };
  }
}
