export class SystemNotificationResponseDto {
  id!: string;
  adminId!: string;
  target!: string; // tenant_id or 'all'
  type!: 'info' | 'warning' | 'critical';
  message!: string;
  dismissible!: boolean;
  isActive!: boolean;
  sentAt!: string;
}
