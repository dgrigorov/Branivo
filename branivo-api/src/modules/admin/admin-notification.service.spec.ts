import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminNotificationService } from './admin-notification.service';
import { AdminNotificationRepository } from './repositories/admin-notification.repository';
import { EmailService } from '../../common/email/email.service';
import { SystemNotificationResponseDto } from './dto/system-notification-response.dto';
import { CreateSystemNotificationDto } from './dto/create-system-notification.dto';

const makeMockRepo = () => ({
  create: jest.fn(),
  findAll: jest.fn(),
  deactivate: jest.fn(),
  findActiveForTenant: jest.fn(),
  dismiss: jest.fn(),
  findById: jest.fn(),
  findBrokerAdminEmails: jest.fn(),
});

const makeMockEmail = () => ({
  sendSystemNotification: jest.fn(),
});

function makeDto(
  overrides?: Partial<SystemNotificationResponseDto>,
): SystemNotificationResponseDto {
  const dto = new SystemNotificationResponseDto();
  dto.id = 'notif-uuid-001';
  dto.adminId = 'admin-uuid-001';
  dto.target = 'all';
  dto.type = 'info';
  dto.message = 'Test';
  dto.dismissible = true;
  dto.isActive = true;
  dto.sentAt = new Date().toISOString();
  return Object.assign(dto, overrides);
}

describe('AdminNotificationService', () => {
  let service: AdminNotificationService;
  let repo: ReturnType<typeof makeMockRepo>;
  let emailService: ReturnType<typeof makeMockEmail>;

  beforeEach(async () => {
    repo = makeMockRepo();
    emailService = makeMockEmail();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminNotificationService,
        { provide: AdminNotificationRepository, useValue: repo },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get(AdminNotificationService);
  });

  describe('broadcast — info type', () => {
    it('creates notification with dismissible=true and no email', async () => {
      const notification = makeDto({ type: 'info', dismissible: true });
      repo.create.mockResolvedValue(notification);

      const dto: CreateSystemNotificationDto = Object.assign(
        new CreateSystemNotificationDto(),
        { message: 'Test', type: 'info' as const },
      );
      const result = await service.broadcast(dto, 'admin-uuid-001');

      expect(result.dismissible).toBe(true);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ dismissible: true, target: 'all' }),
      );
      expect(emailService.sendSystemNotification).not.toHaveBeenCalled();
    });
  });

  describe('broadcast — warning type', () => {
    it('creates notification with dismissible=true and no email', async () => {
      const notification = makeDto({ type: 'warning', dismissible: true });
      repo.create.mockResolvedValue(notification);

      const dto: CreateSystemNotificationDto = Object.assign(
        new CreateSystemNotificationDto(),
        { message: 'Warning', type: 'warning' as const },
      );
      const result = await service.broadcast(dto, 'admin-uuid-001');

      expect(result.dismissible).toBe(true);
      expect(emailService.sendSystemNotification).not.toHaveBeenCalled();
    });
  });

  describe('broadcast — critical type', () => {
    it('creates notification with dismissible=false and sends emails', async () => {
      const notification = makeDto({ type: 'critical', dismissible: false });
      repo.create.mockResolvedValue(notification);
      repo.findBrokerAdminEmails.mockResolvedValue([
        'broker1@demo.bg',
        'broker2@demo.bg',
      ]);
      emailService.sendSystemNotification.mockResolvedValue(undefined);

      const dto: CreateSystemNotificationDto = Object.assign(
        new CreateSystemNotificationDto(),
        { message: 'Critical!', type: 'critical' as const },
      );
      const result = await service.broadcast(dto, 'admin-uuid-001');

      expect(result.dismissible).toBe(false);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ dismissible: false }),
      );
      expect(emailService.sendSystemNotification).toHaveBeenCalledTimes(2);
    });

    it('does not stop sending emails when one fails', async () => {
      const notification = makeDto({ type: 'critical', dismissible: false });
      repo.create.mockResolvedValue(notification);
      repo.findBrokerAdminEmails.mockResolvedValue([
        'fail@demo.bg',
        'ok@demo.bg',
      ]);
      emailService.sendSystemNotification
        .mockRejectedValueOnce(new Error('SMTP error'))
        .mockResolvedValueOnce(undefined);

      const dto: CreateSystemNotificationDto = Object.assign(
        new CreateSystemNotificationDto(),
        { message: 'Critical!', type: 'critical' as const },
      );
      await expect(
        service.broadcast(dto, 'admin-uuid-001'),
      ).resolves.toBeDefined();
      expect(emailService.sendSystemNotification).toHaveBeenCalledTimes(2);
    });
  });

  describe('deactivate', () => {
    it('throws NotFoundException when notification not found', async () => {
      repo.deactivate.mockResolvedValue(false);

      await expect(service.deactivate('nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('resolves without error when found and deactivated', async () => {
      repo.deactivate.mockResolvedValue(true);

      await expect(
        service.deactivate('notif-uuid-001'),
      ).resolves.toBeUndefined();
    });
  });

  describe('dismiss', () => {
    it('throws NotFoundException when notification not found', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.dismiss('notif-uuid-001', 'tenant-uuid-001'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when critical notification', async () => {
      repo.findById.mockResolvedValue(
        makeDto({ dismissible: false, type: 'critical' }),
      );

      await expect(
        service.dismiss('notif-uuid-001', 'tenant-uuid-001'),
      ).rejects.toThrow(BadRequestException);
    });

    it('dismisses when notification is dismissible', async () => {
      repo.findById.mockResolvedValue(makeDto({ dismissible: true }));
      repo.dismiss.mockResolvedValue(undefined);

      await expect(
        service.dismiss('notif-uuid-001', 'tenant-uuid-001'),
      ).resolves.toBeUndefined();
      expect(repo.dismiss).toHaveBeenCalledWith(
        'notif-uuid-001',
        'tenant-uuid-001',
      );
    });
  });
});
