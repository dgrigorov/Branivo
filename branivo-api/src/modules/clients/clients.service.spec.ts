import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ClientsService } from './clients.service';
import { PushSubscriptionRepository } from '../notifications/repositories/push-subscription.repository';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { RegisterPushSubscriptionDto } from '../notifications/dto/register-push-subscription.dto';

const mockPushSubRepo = {
  upsertSubscription: jest.fn().mockResolvedValue(undefined),
};

const mockTenantContext = {
  getTenantId: jest.fn().mockReturnValue('tenant-uuid-123'),
};

const mockDataSource = {
  query: jest.fn().mockResolvedValue(undefined),
};

describe('ClientsService', () => {
  let service: ClientsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: PushSubscriptionRepository, useValue: mockPushSubRepo },
        { provide: TenantContext, useValue: mockTenantContext },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
  });

  describe('registerPushSubscription', () => {
    const dto: RegisterPushSubscriptionDto = {
      endpoint: 'https://push.example.com/sub/xyz',
      p256dh: 'p256dhKeyBase64',
      auth: 'authSecretBase64',
      type: 'web',
    };

    it('делегира към PushSubscriptionRepository.upsertSubscription', async () => {
      await service.registerPushSubscription('client-uuid-456', dto);

      expect(mockPushSubRepo.upsertSubscription).toHaveBeenCalledWith(
        'client-uuid-456',
        {
          endpoint: dto.endpoint,
          p256dh: dto.p256dh,
          auth: dto.auth,
          type: 'web',
        },
      );
    });

    it('логва в audit_log след upsert', async () => {
      await service.registerPushSubscription('client-uuid-456', dto);

      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_log'),
        expect.arrayContaining([
          'tenant-uuid-123',
          'client-uuid-456',
          'client.push_subscription.registered',
        ]),
      );
    });

    it('type defaults to web когато не е подаден', async () => {
      const dtoNoType: RegisterPushSubscriptionDto = {
        endpoint: 'https://push.example.com/sub/abc',
        p256dh: 'key',
        auth: 'secret',
      };

      await service.registerPushSubscription('client-uuid-789', dtoNoType);

      expect(mockPushSubRepo.upsertSubscription).toHaveBeenCalledWith(
        'client-uuid-789',
        expect.objectContaining({ type: 'web' }),
      );
    });

    it('audit_log грешка не хвърля exception', async () => {
      mockDataSource.query.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        service.registerPushSubscription('client-uuid-456', dto),
      ).resolves.not.toThrow();
    });
  });
});
