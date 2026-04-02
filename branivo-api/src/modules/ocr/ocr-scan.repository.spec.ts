import { UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { OcrScanRepository } from './ocr-scan.repository';
import { OcrScanEntity } from './entities/ocr-scan.entity';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { CreateOcrLogDto } from './dto/create-ocr-log.dto';

const TENANT_ID = 'tenant-uuid-ocr-scan';
const SCAN_ID = 'scan-uuid-123';

const mockTenantContext = {
  getTenantId: jest.fn().mockReturnValue(TENANT_ID),
};

const mockEntity = { id: SCAN_ID, tenantId: TENANT_ID } as OcrScanEntity;

const mockRepo = {
  create: jest.fn().mockReturnValue(mockEntity),
  save: jest.fn().mockResolvedValue(mockEntity),
};

describe('OcrScanRepository', () => {
  let repository: OcrScanRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTenantContext.getTenantId.mockReturnValue(TENANT_ID);
    repository = new OcrScanRepository(
      mockRepo as unknown as Repository<OcrScanEntity>,
      mockTenantContext as unknown as TenantContext,
    );
  });

  describe('createScan', () => {
    it('inserts scan with correct tenant_id from TenantContext', async () => {
      const dto: CreateOcrLogDto = {
        blur_variance: 180.0,
        brightness_avg: 115.0,
        frame_fill_pct: 0.72,
        photo_count: 2,
        mlkit_confidence: 0.88,
        final_score: 0.87,
        score_bucket: 'auto',
        vin_found: true,
      };

      const result = await repository.createScan(dto);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          blurVariance: 180.0,
          brightnessAvg: 115.0,
          scoreBucket: 'auto',
          vinFound: true,
        }),
      );
      expect(mockRepo.save).toHaveBeenCalledWith(mockEntity);
      expect(result).toEqual(mockEntity);
    });

    it('throws UnauthorizedException when tenantId is null', async () => {
      mockTenantContext.getTenantId.mockReturnValue(null as unknown as string);

      const dto: CreateOcrLogDto = {};

      await expect(repository.createScan(dto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('deduplicates user_corrected_fields', async () => {
      const dto: CreateOcrLogDto = {
        user_corrected_fields: ['make', 'model', 'make'],
      };

      await repository.createScan(dto);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userCorrectedFields: ['make', 'model'],
        }),
      );
    });

    it('sets visionUsed false when not provided', async () => {
      await repository.createScan({});

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          visionUsed: false,
        }),
      );
    });

    it('sets quoteInitiated false when not provided', async () => {
      await repository.createScan({});

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          quoteInitiated: false,
        }),
      );
    });
  });
});
