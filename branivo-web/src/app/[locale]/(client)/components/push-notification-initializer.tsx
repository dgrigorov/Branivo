'use client';

import { usePushNotifications } from '../../../../hooks/usePushNotifications';

export function PushNotificationInitializer(): null {
  usePushNotifications();
  return null;
}
