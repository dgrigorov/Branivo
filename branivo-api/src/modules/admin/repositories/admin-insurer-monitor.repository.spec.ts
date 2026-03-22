import { AdminInsurerMonitorRepository } from './admin-insurer-monitor.repository';

describe('AdminInsurerMonitorRepository', () => {
  let repository: AdminInsurerMonitorRepository;
  let mockQuery: jest.Mock;
  let mockManagerQuery: jest.Mock;

  beforeEach(() => {
    mockQuery = jest.fn();
    mockManagerQuery = jest.fn().mockResolvedValue([]);

    const dataSource = {
      query: mockQuery,
      transaction: jest
        .fn()
        .mockImplementation(
          async (cb: (manager: { query: jest.Mock }) => Promise<void>) => {
            await cb({ query: mockManagerQuery });
          },
        ),
    };

    repository = new AdminInsurerMonitorRepository(dataSource as never);
  });

  describe('findAllInsurers()', () => {
    it('трябва да върне списък с застрахователи', async () => {
      const mockRows = [
        {
          id: 'uuid-1',
          name: 'Allianz',
          code: 'allianz',
          isActive: true,
          isManuallyDisabled: false,
          disabledReason: null,
          disabledByAdminId: null,
        },
      ];
      mockQuery.mockResolvedValue(mockRows);

      const result = await repository.findAllInsurers();
      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('allianz');
      expect(result[0].isManuallyDisabled).toBe(false);
    });

    it('трябва да върне празен масив при липса на insurers', async () => {
      mockQuery.mockResolvedValue([]);
      const result = await repository.findAllInsurers();
      expect(result).toHaveLength(0);
    });
  });

  describe('findInsurerById()', () => {
    it('трябва да върне insurer при съществуващ id', async () => {
      const mockRow = {
        id: 'uuid-1',
        name: 'Allianz',
        code: 'allianz',
        isActive: true,
        isManuallyDisabled: false,
        disabledReason: null,
        disabledByAdminId: null,
      };
      mockQuery.mockResolvedValue([mockRow]);

      const result = await repository.findInsurerById('uuid-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('uuid-1');
      expect(result!.code).toBe('allianz');
    });

    it('трябва да върне null при несъществуващ id', async () => {
      mockQuery.mockResolvedValue([]);

      const result = await repository.findInsurerById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('disableInsurer()', () => {
    it('трябва да извика UPDATE и INSERT в транзакция', async () => {
      await repository.disableInsurer('insurer-id', 'admin-id', 'API degraded');

      expect(mockManagerQuery).toHaveBeenCalledTimes(2);

      const firstCall = mockManagerQuery.mock.calls[0] as [string, string[]];
      expect(firstCall[0]).toContain('UPDATE insurers');
      expect(firstCall[1]).toEqual(['insurer-id', 'API degraded', 'admin-id']);

      const secondCall = mockManagerQuery.mock.calls[1] as [string, string[]];
      expect(secondCall[0]).toContain('INSERT INTO audit_log');
      expect(secondCall[0]).toContain('insurer.manual_fallback.activated');
    });
  });

  describe('enableInsurer()', () => {
    it('трябва да извика UPDATE и INSERT в транзакция', async () => {
      await repository.enableInsurer('insurer-id', 'admin-id');

      expect(mockManagerQuery).toHaveBeenCalledTimes(2);

      const firstCall = mockManagerQuery.mock.calls[0] as [string, string[]];
      expect(firstCall[0]).toContain('UPDATE insurers');
      expect(firstCall[0]).toContain('is_manually_disabled = false');

      const secondCall = mockManagerQuery.mock.calls[1] as [string, string[]];
      expect(secondCall[0]).toContain('insurer.manual_fallback.deactivated');
    });
  });
});
