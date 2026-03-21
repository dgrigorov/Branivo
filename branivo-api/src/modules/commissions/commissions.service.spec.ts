import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { CommissionsService } from './commissions.service';
import { CommissionsRepository } from './commissions.repository';
import { CommissionMatrix } from './entities/commission-matrix.entity';
import { ProductType } from './enums/product-type.enum';
import { UpsertCommissionRateDto } from './dto/upsert-commission-rate.dto';

const mockRepo = {
  findByInsurerAndProduct: jest.fn(),
  findAll: jest.fn(),
  upsert: jest.fn(),
};

const mockConfig = {
  get: jest.fn().mockReturnValue('0.05'),
};

const mockDataSource = {
  query: jest.fn().mockResolvedValue([]),
};

describe('CommissionsService', () => {
  let service: CommissionsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommissionsService,
        { provide: CommissionsRepository, useValue: mockRepo },
        { provide: ConfigService, useValue: mockConfig },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<CommissionsService>(CommissionsService);
  });

  describe('getRate', () => {
    it('returns rate from commission_matrix when entry exists', async () => {
      const entry = {
        ratePct: 0.045,
        insurer: { name: 'Allianz' },
      } as unknown as CommissionMatrix;
      mockRepo.findByInsurerAndProduct.mockResolvedValue(entry);

      const rate = await service.getRate('insurer-uuid', 'GO');

      expect(rate).toBe(0.045);
      expect(mockRepo.findByInsurerAndProduct).toHaveBeenCalledWith(
        'insurer-uuid',
        'GO',
      );
    });

    it('falls back to PLATFORM_FEE_PCT when no entry exists', async () => {
      mockRepo.findByInsurerAndProduct.mockResolvedValue(null);
      mockConfig.get.mockReturnValue('0.03');

      const rate = await service.getRate('insurer-uuid', 'KASKO');

      expect(rate).toBe(0.03);
    });

    it('uses default 0.05 when PLATFORM_FEE_PCT is not configured', async () => {
      mockRepo.findByInsurerAndProduct.mockResolvedValue(null);
      mockConfig.get.mockReturnValue(undefined);

      const rate = await service.getRate('insurer-uuid', 'GO');

      expect(rate).toBe(0.05);
    });
  });

  describe('upsertRate', () => {
    const dto: UpsertCommissionRateDto = {
      productType: ProductType.GO,
      ratePct: 0.06,
    };

    const mockEntry: CommissionMatrix = {
      id: 'entry-uuid',
      insurerId: 'insurer-uuid',
      productType: ProductType.GO,
      ratePct: 0.06,
      createdBy: 'user-uuid',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      insurer: {
        id: 'insurer-uuid',
        name: 'Allianz Bulgaria',
      } as CommissionMatrix['insurer'],
    };

    it('calls upsert on repository and writes to audit_log', async () => {
      mockRepo.findByInsurerAndProduct.mockResolvedValueOnce({ ratePct: 0.05 });
      mockRepo.upsert.mockResolvedValue(mockEntry);

      await service.upsertRate('insurer-uuid', dto, 'user-uuid');

      expect(mockRepo.upsert).toHaveBeenCalledWith({
        insurerId: 'insurer-uuid',
        productType: ProductType.GO,
        ratePct: 0.06,
        createdBy: 'user-uuid',
      });
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_log'),
        expect.arrayContaining([
          '00000000-0000-0000-0000-000000000000',
          'user-uuid',
          'commission_matrix.updated',
          'commission_matrix',
          'entry-uuid',
        ]),
      );
    });

    it('records old_rate and new_rate in audit log metadata', async () => {
      mockRepo.findByInsurerAndProduct.mockResolvedValueOnce({ ratePct: 0.05 });
      mockRepo.upsert.mockResolvedValue(mockEntry);

      await service.upsertRate('insurer-uuid', dto, 'user-uuid');

      const auditCall = mockDataSource.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      const metadataJson = auditCall[1][5] as string;
      const metadata = JSON.parse(metadataJson) as {
        old_rate: number;
        new_rate: number;
      };

      expect(metadata.old_rate).toBe(0.05);
      expect(metadata.new_rate).toBe(0.06);
    });

    it('records null old_rate when no prior entry exists', async () => {
      mockRepo.findByInsurerAndProduct.mockResolvedValueOnce(null);
      mockRepo.upsert.mockResolvedValue(mockEntry);

      await service.upsertRate('insurer-uuid', dto, null);

      const auditCall = mockDataSource.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      const metadataJson = auditCall[1][5] as string;
      const metadata = JSON.parse(metadataJson) as { old_rate: number | null };

      expect(metadata.old_rate).toBeNull();
    });
  });

  describe('listMatrix', () => {
    it('returns mapped entries with insurer name', async () => {
      const entries: CommissionMatrix[] = [
        {
          id: 'e1',
          insurerId: 'i1',
          productType: ProductType.GO,
          ratePct: 0.05,
          createdBy: null,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-02'),
          insurer: { name: 'Allianz Bulgaria' } as CommissionMatrix['insurer'],
        },
      ];
      mockRepo.findAll.mockResolvedValue(entries);

      const result = await service.listMatrix();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        insurerId: 'i1',
        insurerName: 'Allianz Bulgaria',
        productType: ProductType.GO,
        ratePct: 0.05,
      });
      expect(result[0].updatedAt).toBe(new Date('2026-01-02').toISOString());
    });
  });
});
