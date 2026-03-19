import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AnonymousSessionsService } from './anonymous-sessions.service';
import { UpdateAnonSessionDto } from './dto/update-anon-session.dto';

const TENANT_ID = 'tenant-uuid-1234';
const SESSION_ID = 'session-uuid-5678';
const OTHER_TENANT_ID = 'other-tenant-uuid-9999';

const mockSessionData = {
  session_id: SESSION_ID,
  tenant_id: TENANT_ID,
  created_at: '2026-03-19T10:00:00.000Z',
};

const mockRedis = {
  setex: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
};

function buildService(): AnonymousSessionsService {
  return new AnonymousSessionsService(mockRedis as any);
}

describe('AnonymousSessionsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── createSession ──────────────────────────────────────────────────────────

  describe('createSession', () => {
    it('records Redis key with TTL 172800 and returns session_id + expires_at', async () => {
      mockRedis.setex.mockResolvedValueOnce('OK');

      const service = buildService();
      const result = await service.createSession(TENANT_ID);

      expect(result.session_id).toBeDefined();
      expect(result.expires_at).toBeDefined();

      // Verify SETEX was called with the correct TTL
      expect(mockRedis.setex).toHaveBeenCalledTimes(1);
      const [key, ttl, payload] = mockRedis.setex.mock.calls[0] as [
        string,
        number,
        string,
      ];
      expect(key).toMatch(/^anon:.+:session$/);
      expect(ttl).toBe(172800);

      const parsed = JSON.parse(payload) as {
        session_id: string;
        tenant_id: string;
      };
      expect(parsed.session_id).toBe(result.session_id);
      expect(parsed.tenant_id).toBe(TENANT_ID);
    });

    it('throws ServiceUnavailableException with requires_login: true when Redis errors', async () => {
      mockRedis.setex.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const service = buildService();
      let caught: ServiceUnavailableException | null = null;
      try {
        await service.createSession(TENANT_ID);
      } catch (err) {
        caught = err as ServiceUnavailableException;
      }

      expect(caught).toBeInstanceOf(ServiceUnavailableException);
      const response = caught!.getResponse() as Record<string, unknown>;
      expect(response.requires_login).toBe(true);
    });
  });

  // ─── getSession ─────────────────────────────────────────────────────────────

  describe('getSession', () => {
    it('returns null for non-existing key', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const service = buildService();
      const result = await service.getSession(SESSION_ID, TENANT_ID);

      expect(result).toBeNull();
    });

    it('returns null when tenant_id does not match (tenant isolation)', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockSessionData));

      const service = buildService();
      const result = await service.getSession(SESSION_ID, OTHER_TENANT_ID);

      expect(result).toBeNull();
    });

    it('returns session data when key exists and tenant matches', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockSessionData));

      const service = buildService();
      const result = await service.getSession(SESSION_ID, TENANT_ID);

      expect(result).toMatchObject(mockSessionData);
    });
  });

  // ─── updateSessionData ──────────────────────────────────────────────────────

  describe('updateSessionData', () => {
    it('throws NotFoundException when session not found (no silent fail)', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const service = buildService();
      await expect(
        service.updateSessionData(SESSION_ID, TENANT_ID, {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('uses SETEX (not SET + EXPIRE) to reset TTL on update', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockSessionData));
      mockRedis.setex.mockResolvedValueOnce('OK');

      const service = buildService();
      const dto: UpdateAnonSessionDto = {
        vehicle_data: {
          reg_number: 'CA1234AB',
          make: 'VW',
          model: 'Golf',
          year: 2020,
        },
      };

      await service.updateSessionData(SESSION_ID, TENANT_ID, dto);

      expect(mockRedis.setex).toHaveBeenCalledTimes(1);
      const [key, ttl] = mockRedis.setex.mock.calls[0] as [string, number];
      expect(key).toBe(`anon:${SESSION_ID}:session`);
      expect(ttl).toBe(172800);
    });
  });

  // ─── migrateSession ─────────────────────────────────────────────────────────

  describe('migrateSession', () => {
    it('deletes Redis key after successful migration', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockSessionData));
      mockRedis.del.mockResolvedValueOnce(1);

      const service = buildService();
      const result = await service.migrateSession(
        SESSION_ID,
        TENANT_ID,
        'user-uuid',
      );

      expect(mockRedis.del).toHaveBeenCalledWith(`anon:${SESSION_ID}:session`);
      expect(result.session_id).toBe(SESSION_ID);
    });

    it('throws NotFoundException when session not found or expired', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const service = buildService();
      await expect(
        service.migrateSession(SESSION_ID, TENANT_ID, 'user-uuid'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
