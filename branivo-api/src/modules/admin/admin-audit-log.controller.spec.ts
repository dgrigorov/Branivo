import { type Server } from 'http';
import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  UnauthorizedException,
} from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');
import { AdminAuditLogController } from './admin-audit-log.controller';
import { AuditService } from '../../common/audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Reflector } from '@nestjs/core';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440001';

const mockVerifyResult = {
  valid: true,
  chainedEntries: 5,
  unchainedEntries: 0,
  checkedAt: '2026-04-07T10:00:00.000Z',
};

const mockAuditService = {
  verifyChain: jest.fn().mockResolvedValue(mockVerifyResult),
};

describe('AdminAuditLogController', () => {
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminAuditLogController],
      providers: [
        { provide: AuditService, useValue: mockAuditService },
        Reflector,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /admin/audit-log/verify-chain', () => {
    it('returns verify result for valid tenantId UUID', async () => {
      const res = await request(app.getHttpServer() as Server)
        .get('/admin/audit-log/verify-chain')
        .query({ tenantId: TENANT_ID })
        .expect(200);

      const body = res.body as typeof mockVerifyResult;
      expect(body.valid).toBe(true);
      expect(body.chainedEntries).toBe(5);
      expect(body.unchainedEntries).toBe(0);
      expect(body.checkedAt).toBe('2026-04-07T10:00:00.000Z');
      expect(mockAuditService.verifyChain).toHaveBeenCalledWith(TENANT_ID);
    });

    it('returns 400 for non-UUID tenantId', async () => {
      await request(app.getHttpServer() as Server)
        .get('/admin/audit-log/verify-chain')
        .query({ tenantId: 'not-a-uuid' })
        .expect(400);
    });

    it('returns 400 when tenantId is missing', async () => {
      await request(app.getHttpServer() as Server)
        .get('/admin/audit-log/verify-chain')
        .expect(400);
    });

    it('returns 401 when JwtAuthGuard rejects', async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [AdminAuditLogController],
        providers: [
          { provide: AuditService, useValue: mockAuditService },
          Reflector,
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({
          canActivate: () => {
            throw new UnauthorizedException();
          },
        })
        .overrideGuard(RolesGuard)
        .useValue({ canActivate: () => true })
        .compile();

      const unauthorizedApp = module.createNestApplication();
      unauthorizedApp.useGlobalPipes(
        new ValidationPipe({ whitelist: true, transform: true }),
      );
      await unauthorizedApp.init();

      await request(unauthorizedApp.getHttpServer() as Server)
        .get('/admin/audit-log/verify-chain')
        .query({ tenantId: TENANT_ID })
        .expect(401);

      await unauthorizedApp.close();
    });

    it('returns 403 when RolesGuard rejects (non-super_admin role)', async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [AdminAuditLogController],
        providers: [
          { provide: AuditService, useValue: mockAuditService },
          Reflector,
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({ canActivate: () => true })
        .overrideGuard(RolesGuard)
        .useValue({ canActivate: () => false })
        .compile();

      const forbiddenApp = module.createNestApplication();
      forbiddenApp.useGlobalPipes(
        new ValidationPipe({ whitelist: true, transform: true }),
      );
      await forbiddenApp.init();

      await request(forbiddenApp.getHttpServer() as Server)
        .get('/admin/audit-log/verify-chain')
        .query({ tenantId: TENANT_ID })
        .expect(403);

      await forbiddenApp.close();
    });

    it('returns valid: false with brokenAt when chain is tampered', async () => {
      const tamperedResult = {
        valid: false,
        chainedEntries: 3,
        unchainedEntries: 0,
        brokenAt: '2026-04-06T10:00:01.000Z',
        checkedAt: '2026-04-07T10:00:00.000Z',
      };
      mockAuditService.verifyChain.mockResolvedValueOnce(tamperedResult);

      const res = await request(app.getHttpServer() as Server)
        .get('/admin/audit-log/verify-chain')
        .query({ tenantId: TENANT_ID })
        .expect(200);

      const body = res.body as typeof tamperedResult;
      expect(body.valid).toBe(false);
      expect(body.brokenAt).toBe('2026-04-06T10:00:01.000Z');
    });
  });
});
