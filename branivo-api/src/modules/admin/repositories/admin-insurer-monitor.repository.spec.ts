import { AdminInsurerMonitorRepository } from './admin-insurer-monitor.repository';
import { AuditService } from '../../../common/audit/audit.service';

describe('AdminInsurerMonitorRepository', () => {
  let repository: AdminInsurerMonitorRepository;
  let mockQuery: jest.Mock;
  let mockAuditLog: jest.Mock;

  beforeEach(() => {
    mockQuery = jest.fn().mockResolvedValue([]);
    mockAuditLog = jest.fn().mockResolvedValue(undefined);

    const dataSource = {
      query: mockQuery,
    };

    const auditService = {
      log: mockAuditLog,
    } as unknown as AuditService;

    repository = new AdminInsurerMonitorRepository(
      dataSource as never,
      auditService,
    );
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
    it('трябва да изпълни UPDATE и да извика auditService.log', async () => {
      await repository.disableInsurer('insurer-id', 'admin-id', 'API degraded');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE insurers'),
        ['insurer-id', 'API degraded', 'admin-id'],
      );
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'insurer.manual_fallback.activated',
          entityType: 'insurer',
          entityId: 'insurer-id',
          userId: 'admin-id',
        }),
      );
    });
  });

  describe('enableInsurer()', () => {
    it('трябва да изпълни UPDATE и да извика auditService.log', async () => {
      await repository.enableInsurer('insurer-id', 'admin-id');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE insurers'),
        expect.arrayContaining(['insurer-id']),
      );
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'insurer.manual_fallback.deactivated',
          entityType: 'insurer',
          entityId: 'insurer-id',
        }),
      );
    });
  });
});
