import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

export interface PushNotificationParams {
  pushToken: string | null;
  title: string;
  body: string;
}

export interface PushResult {
  status: 'sent' | 'push_skipped';
}

@Injectable()
export class PushChannel {
  private readonly logger = new Logger(PushChannel.name);

  constructor(private readonly config: ConfigService) {}

  private initFirebase(): void {
    if (admin.apps.length > 0) return;
    const rawKey = this.config.get<string>('FIREBASE_PRIVATE_KEY') ?? '';
    const privateKey = rawKey.replace(/\\n/g, '\n');
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: this.config.get<string>('FIREBASE_PROJECT_ID'),
        clientEmail: this.config.get<string>('FIREBASE_CLIENT_EMAIL'),
        privateKey,
      }),
    });
  }

  async send(params: PushNotificationParams): Promise<PushResult> {
    if (!params.pushToken) return { status: 'push_skipped' };
    this.initFirebase();
    try {
      await admin.messaging().send({
        token: params.pushToken,
        notification: { title: params.title, body: params.body },
      });
      return { status: 'sent' };
    } catch (err) {
      const errorCode = (err as { code?: string }).code;
      if (errorCode === 'messaging/registration-token-not-registered') {
        this.logger.warn(
          `FCM token not registered, skipping: ${params.pushToken}`,
        );
        return { status: 'push_skipped' };
      }
      throw err;
    }
  }
}
