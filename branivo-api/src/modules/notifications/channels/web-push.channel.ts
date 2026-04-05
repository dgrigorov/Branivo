import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import type { SendResult } from 'web-push';

export interface WebPushSubscriptionDto {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface WebPushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
}

export interface WebPushResult {
  status: 'sent' | 'expired';
  endpoint: string;
}

@Injectable()
export class WebPushChannel {
  private readonly logger = new Logger(WebPushChannel.name);

  constructor(private readonly config: ConfigService) {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject =
      this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:admin@branivo.io';

    if (publicKey && privateKey) {
      webPush.setVapidDetails(subject, publicKey, privateKey);
    }
  }

  async send(
    subscription: WebPushSubscriptionDto,
    payload: WebPushPayload,
  ): Promise<WebPushResult> {
    const pushSubscription: webPush.PushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    };

    try {
      const result: SendResult = await webPush.sendNotification(
        pushSubscription,
        JSON.stringify(payload),
      );
      this.logger.debug(
        `Web push sent to ${subscription.endpoint} — statusCode: ${result.statusCode}`,
      );
      return { status: 'sent', endpoint: subscription.endpoint };
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 410 || statusCode === 404) {
        this.logger.warn(
          `Web push subscription expired (${statusCode}): ${subscription.endpoint}`,
        );
        return { status: 'expired', endpoint: subscription.endpoint };
      }
      throw err;
    }
  }
}
