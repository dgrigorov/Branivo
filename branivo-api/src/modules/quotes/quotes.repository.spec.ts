import { DataSource, IsNull, Repository } from 'typeorm';
import { QuotesRepository } from './quotes.repository';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { Insurer } from './entities/insurer.entity';
import { Quote } from './entities/quote.entity';

describe('QuotesRepository', () => {
  describe('findActiveInsurers()', () => {
    let repository: QuotesRepository;
    let mockInsurerRepo: { find: jest.Mock };
    let mockDataSource: { getRepository: jest.Mock };
    let mockTenantContext: jest.Mocked<TenantContext>;

    const makeInsurer = (
      id: string,
      isActive: boolean,
      isManuallyDisabled: boolean,
    ): Partial<Insurer> => ({
      id,
      name: `Insurer ${id}`,
      code: `code-${id}`,
      isActive,
      isManuallyDisabled,
      deletedAt: null,
    });

    beforeEach(() => {
      mockInsurerRepo = { find: jest.fn() };
      mockDataSource = {
        getRepository: jest.fn().mockReturnValue(mockInsurerRepo),
      };
      mockTenantContext = {
        getTenantId: jest.fn().mockReturnValue('tenant-uuid'),
      } as unknown as jest.Mocked<TenantContext>;

      const mockQuoteRepo = {
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        update: jest.fn(),
        manager: {},
      };

      repository = new QuotesRepository(
        mockQuoteRepo as unknown as Repository<Quote>,
        mockDataSource as unknown as DataSource,
        mockTenantContext,
      );
    });

    it('трябва да включва само активни и не-деактивирани insurers', async () => {
      const activeInsurer = makeInsurer('uuid-1', true, false);
      mockInsurerRepo.find.mockResolvedValue([activeInsurer]);

      const result = await repository.findActiveInsurers();

      expect(mockDataSource.getRepository).toHaveBeenCalledWith(Insurer);
      expect(mockInsurerRepo.find).toHaveBeenCalledWith({
        where: {
          isActive: true,
          isManuallyDisabled: false,
          deletedAt: IsNull(),
        },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('uuid-1');
    });

    it('трябва да изключва insurer с isManuallyDisabled = true', async () => {
      // isManuallyDisabled = true — Super Admin е деактивирал застрахователя
      mockInsurerRepo.find.mockResolvedValue([]); // DB филтрира на ниво заявка

      const result = await repository.findActiveInsurers();

      expect(result).toHaveLength(0);
      // Потвърди, че заявката съдържа isManuallyDisabled: false
      const callArgs = mockInsurerRepo.find.mock.calls[0] as [
        { where: { isManuallyDisabled: boolean } },
      ];
      expect(callArgs[0].where.isManuallyDisabled).toBe(false);
    });

    it('трябва да изключва неактивни insurers (isActive = false)', async () => {
      mockInsurerRepo.find.mockResolvedValue([]);

      const result = await repository.findActiveInsurers();

      expect(result).toHaveLength(0);
      const callArgs = mockInsurerRepo.find.mock.calls[0] as [
        { where: { isActive: boolean } },
      ];
      expect(callArgs[0].where.isActive).toBe(true);
    });

    it('трябва да изключва soft-deleted insurers (deletedAt != null)', async () => {
      mockInsurerRepo.find.mockResolvedValue([]);

      await repository.findActiveInsurers();

      const callArgs = mockInsurerRepo.find.mock.calls[0] as [
        { where: { deletedAt: ReturnType<typeof IsNull> } },
      ];
      // Потвърди, че deletedAt условие присъства (IsNull)
      expect(callArgs[0].where.deletedAt).toBeDefined();
    });

    it('трябва да върне множество активни insurers', async () => {
      const insurers = [
        makeInsurer('uuid-1', true, false),
        makeInsurer('uuid-2', true, false),
        makeInsurer('uuid-3', true, false),
      ];
      mockInsurerRepo.find.mockResolvedValue(insurers);

      const result = await repository.findActiveInsurers();

      expect(result).toHaveLength(3);
    });

    it('трябва да върне празен масив при липса на активни insurers', async () => {
      mockInsurerRepo.find.mockResolvedValue([]);

      const result = await repository.findActiveInsurers();

      expect(result).toHaveLength(0);
    });
  });
});
