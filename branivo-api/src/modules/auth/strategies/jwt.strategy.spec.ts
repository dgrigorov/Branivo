import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { REDIS_CLIENT } from '../../../infrastructure/redis/redis.module';
import { JwtStrategy, JwtPayload } from './jwt.strategy';

const validPayload: JwtPayload = {
  sub: 'user-uuid',
  tid: 'tenant-uuid',
  role: 'broker_admin',
  jti: 'jti-uuid',
  exp: Math.floor(Date.now() / 1000) + 900,
};

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let redisMock: { exists: jest.Mock };

  beforeEach(async () => {
    redisMock = { exists: jest.fn() };
    const configMock = {
      getOrThrow: jest.fn().mockReturnValue('test-secret-32-chars-minimum-len'),
    };

    const module = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: configMock },
        { provide: REDIS_CLIENT, useValue: redisMock },
      ],
    }).compile();

    strategy = module.get(JwtStrategy);
  });

  it('returns authenticated user for valid non-blacklisted token', async () => {
    redisMock.exists.mockResolvedValue(0);

    const result = await strategy.validate(validPayload);

    expect(result).toEqual({
      userId: 'user-uuid',
      tenantId: 'tenant-uuid',
      role: 'broker_admin',
      jti: 'jti-uuid',
      exp: validPayload.exp,
    });
  });

  it('throws UnauthorizedException for blacklisted JTI', async () => {
    redisMock.exists.mockResolvedValue(1);

    await expect(strategy.validate(validPayload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException (fail-secure) when Redis is unavailable', async () => {
    redisMock.exists.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(strategy.validate(validPayload)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
