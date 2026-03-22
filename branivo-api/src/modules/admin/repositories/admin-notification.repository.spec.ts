import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { AdminNotificationRepository } from './admin-notification.repository';
import { SystemNotificationResponseDto } from '../dto/system-notification-response.dto';

const mockQuery = jest.fn();
const mockDataSource = { query: mockQuery };

const notifRow = {
  id: 'notif-uuid-001',
  admin_id: 'admin-uuid-001',
  target: 'all',
  type: 'info' as const,
  message: 'Test notification',
  dismissible: true,
  is_active: true,
  sent_at: new Date('2026-03-22T00:00:00Z'),
};

describe('AdminNotificationRepository', () => {
  let repository: AdminNotificationRepository;

  beforeEach(async () => {
    mockQuery.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminNotificationRepository,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    repository = module.get(AdminNotificationRepository);
  });

  describe('create', () => {
    it('inserts notification and returns DTO', async () => {
      mockQuery.mockResolvedValue([notifRow]);

      const result = await repository.create({
        adminId: 'admin-uuid-001',
        target: 'all',
        type: 'info',
        message: 'Test notification',
        dismissible: true,
      });

      expect(result).toBeInstanceOf(SystemNotificationResponseDto);
      expect(result.id).toBe('notif-uuid-001');
      expect(result.adminId).toBe('admin-uuid-001');
      expect(result.target).toBe('all');
      expect(result.dismissible).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO system_notifications'),
        ['admin-uuid-001', 'all', 'info', 'Test notification', true],
      );
    });
  });

  describe('findAll', () => {
    it('returns all notifications ordered by sent_at DESC', async () => {
      mockQuery.mockResolvedValue([notifRow]);

      const result = await repository.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('notif-uuid-001');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY sent_at DESC'),
      );
    });
  });

  describe('deactivate', () => {
    it('returns true when notification was updated', async () => {
      mockQuery.mockResolvedValue([{ id: 'notif-uuid-001' }]);

      const result = await repository.deactivate('notif-uuid-001');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_active = false'),
        ['notif-uuid-001'],
      );
    });

    it('returns false when notification not found or already inactive', async () => {
      mockQuery.mockResolvedValue([]);

      const result = await repository.deactivate('nonexistent-id');

      expect(result).toBe(false);
    });
  });

  describe('findActiveForTenant', () => {
    it('fetches active notifications excluding dismissed ones', async () => {
      mockQuery.mockResolvedValue([notifRow]);

      const result = await repository.findActiveForTenant('tenant-uuid-001');

      expect(result).toHaveLength(1);
      expect(result[0].isActive).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('system_notification_dismissals'),
        ['tenant-uuid-001'],
      );
    });
  });

  describe('dismiss', () => {
    it('inserts dismissal record with ON CONFLICT DO NOTHING', async () => {
      mockQuery.mockResolvedValue([]);

      await repository.dismiss('notif-uuid-001', 'tenant-uuid-001');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT DO NOTHING'),
        ['notif-uuid-001', 'tenant-uuid-001'],
      );
    });
  });

  describe('findById', () => {
    it('returns DTO when notification found', async () => {
      mockQuery.mockResolvedValue([notifRow]);

      const result = await repository.findById('notif-uuid-001');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('notif-uuid-001');
    });

    it('returns null when notification not found', async () => {
      mockQuery.mockResolvedValue([]);

      const result = await repository.findById('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('findBrokerAdminEmails', () => {
    it('fetches all broker_admin emails when target is all', async () => {
      mockQuery.mockResolvedValue([{ email: 'broker@demo.bg' }]);

      const result = await repository.findBrokerAdminEmails('all');

      expect(result).toEqual(['broker@demo.bg']);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('JOIN tenants'),
      );
    });

    it('fetches tenant-specific broker_admin emails', async () => {
      mockQuery.mockResolvedValue([{ email: 'broker@tenant.bg' }]);

      const result = await repository.findBrokerAdminEmails('tenant-uuid-001');

      expect(result).toEqual(['broker@tenant.bg']);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('tenant_id = $1'),
        ['tenant-uuid-001'],
      );
    });
  });
});
