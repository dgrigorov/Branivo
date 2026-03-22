/**
 * Super Admin context — intentionally NO tenant_id scope.
 * system_notifications is a cross-tenant platform table.
 * This is a legitimate exception documented in project-context.md.
 */
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SystemNotificationResponseDto } from '../dto/system-notification-response.dto';

interface NotificationRow {
  id: string;
  admin_id: string;
  target: string;
  type: 'info' | 'warning' | 'critical';
  message: string;
  dismissible: boolean;
  is_active: boolean;
  sent_at: Date;
}

function rowToDto(row: NotificationRow): SystemNotificationResponseDto {
  const dto = new SystemNotificationResponseDto();
  dto.id = row.id;
  dto.adminId = row.admin_id;
  dto.target = row.target;
  dto.type = row.type;
  dto.message = row.message;
  dto.dismissible = row.dismissible;
  dto.isActive = row.is_active;
  dto.sentAt =
    row.sent_at instanceof Date
      ? row.sent_at.toISOString()
      : String(row.sent_at);
  return dto;
}

@Injectable()
export class AdminNotificationRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async create(params: {
    adminId: string;
    target: string;
    type: 'info' | 'warning' | 'critical';
    message: string;
    dismissible: boolean;
  }): Promise<SystemNotificationResponseDto> {
    const rows = await this.dataSource.query<NotificationRow[]>(
      `INSERT INTO system_notifications (admin_id, target, type, message, dismissible)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        params.adminId,
        params.target,
        params.type,
        params.message,
        params.dismissible,
      ],
    );
    return rowToDto(rows[0]);
  }

  async findAll(): Promise<SystemNotificationResponseDto[]> {
    const rows = await this.dataSource.query<NotificationRow[]>(
      `SELECT id, admin_id, target, type, message, dismissible, is_active, sent_at
       FROM system_notifications
       ORDER BY sent_at DESC`,
    );
    return rows.map(rowToDto);
  }

  async deactivate(notificationId: string): Promise<boolean> {
    const rows = await this.dataSource.query<{ id: string }[]>(
      `UPDATE system_notifications
       SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND is_active = true
       RETURNING id`,
      [notificationId],
    );
    return rows.length > 0;
  }

  async findActiveForTenant(
    tenantId: string,
  ): Promise<SystemNotificationResponseDto[]> {
    const rows = await this.dataSource.query<NotificationRow[]>(
      `SELECT sn.*
       FROM system_notifications sn
       WHERE sn.is_active = true
         AND (sn.target = $1 OR sn.target = 'all')
         AND NOT EXISTS (
           SELECT 1 FROM system_notification_dismissals snd
           WHERE snd.notification_id = sn.id AND snd.tenant_id = $1::uuid
         )
       ORDER BY sn.sent_at DESC`,
      [tenantId],
    );
    return rows.map(rowToDto);
  }

  async dismiss(notificationId: string, tenantId: string): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO system_notification_dismissals (notification_id, tenant_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [notificationId, tenantId],
    );
  }

  async findById(
    notificationId: string,
  ): Promise<SystemNotificationResponseDto | null> {
    const rows = await this.dataSource.query<NotificationRow[]>(
      `SELECT * FROM system_notifications WHERE id = $1`,
      [notificationId],
    );
    return rows[0] ? rowToDto(rows[0]) : null;
  }

  async findBrokerAdminEmails(target: string): Promise<string[]> {
    if (target === 'all') {
      const rows = await this.dataSource.query<{ email: string }[]>(
        `SELECT u.email FROM users u
         JOIN tenants t ON t.id = u.tenant_id
         WHERE u.role = 'broker_admin'
           AND t.deleted_at IS NULL
           AND u.deleted_at IS NULL`,
      );
      return rows.map((r) => r.email);
    }

    const rows = await this.dataSource.query<{ email: string }[]>(
      `SELECT email FROM users
       WHERE tenant_id = $1
         AND role = 'broker_admin'
         AND deleted_at IS NULL`,
      [target],
    );
    return rows.map((r) => r.email);
  }
}
