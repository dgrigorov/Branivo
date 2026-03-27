import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantContext } from '../../common/tenant-context/tenant.context';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tenantContext: TenantContext,
  ) {}

  async sendOtp(phoneNumber: string, otpCode: string): Promise<void> {
    const tenantDomain = this.resolveTenantDomain();
    const body = this.buildSmsBody(otpCode, tenantDomain);

    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const fromNumber = this.config.get<string>('TWILIO_PHONE_NUMBER');

    if (!accountSid || !authToken || !fromNumber) {
      if (this.config.get<string>('NODE_ENV') !== 'production') {
        this.logger.warn(
          `[DEV] Twilio not configured — OTP за ${phoneNumber}: ${otpCode}`,
        );
        return;
      }
      throw new ServiceUnavailableException('SMS услугата не е конфигурирана');
    }

    try {
      // Twilio REST API call (avoids direct SDK import for testability)
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
            To: phoneNumber,
            From: fromNumber,
            Body: body,
          }).toString(),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Twilio SMS failed: ${response.status} ${errorText}`);
        throw new ServiceUnavailableException('Неуспешно изпращане на SMS');
      }
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.error('Twilio request error', err);
      throw new ServiceUnavailableException('Неуспешно изпращане на SMS');
    }
  }

  private buildSmsBody(otpCode: string, tenantDomain: string): string {
    return `Вашият Branivo код е: ${otpCode}. Валиден 5 минути.\n\n@${tenantDomain} #${otpCode}`;
  }

  private resolveTenantDomain(): string {
    return this.tenantContext.getDomain();
  }
}
