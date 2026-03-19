import { Test, TestingModule } from '@nestjs/testing';
import { DnsVerificationService } from './dns-verification.service';

// Mock the dns module
const mockResolveTxt = jest.fn();
jest.mock('dns', () => ({
  promises: {
    resolveTxt: (...args: unknown[]): unknown => mockResolveTxt(...args),
  },
}));

describe('DnsVerificationService', () => {
  let service: DnsVerificationService;

  const DOMAIN = 'polici.mybrokerage.bg';
  const TOKEN = 'abc123def456'.padEnd(64, '0');
  const RECORD_NAME = `_branivo-verify.${DOMAIN}`;
  const EXPECTED_VALUE = `branivo-verify=${TOKEN}`;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DnsVerificationService],
    }).compile();

    service = module.get(DnsVerificationService);
    jest.clearAllMocks();
  });

  it('returns true when TXT record contains the expected value', async () => {
    mockResolveTxt.mockResolvedValue([[EXPECTED_VALUE]]);

    const result = await service.verifyTxtRecord(DOMAIN, TOKEN);

    expect(result).toBe(true);
    expect(mockResolveTxt).toHaveBeenCalledWith(RECORD_NAME);
  });

  it('returns true when TXT record value is split across chunks', async () => {
    // TXT records can be chunked; chunks are joined before comparison
    const half = EXPECTED_VALUE.length / 2;
    const chunk1 = EXPECTED_VALUE.slice(0, half);
    const chunk2 = EXPECTED_VALUE.slice(half);
    mockResolveTxt.mockResolvedValue([[chunk1, chunk2]]);

    const result = await service.verifyTxtRecord(DOMAIN, TOKEN);

    expect(result).toBe(true);
  });

  it('returns false when DNS record does not exist (ENOTFOUND)', async () => {
    const err = Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
    mockResolveTxt.mockRejectedValue(err);

    const result = await service.verifyTxtRecord(DOMAIN, TOKEN);

    expect(result).toBe(false);
  });

  it('returns false when DNS record does not exist (ENODATA)', async () => {
    const err = Object.assign(new Error('ENODATA'), { code: 'ENODATA' });
    mockResolveTxt.mockRejectedValue(err);

    const result = await service.verifyTxtRecord(DOMAIN, TOKEN);

    expect(result).toBe(false);
  });

  it('returns false when DNS server fails (ESERVFAIL)', async () => {
    const err = Object.assign(new Error('ESERVFAIL'), { code: 'ESERVFAIL' });
    mockResolveTxt.mockRejectedValue(err);

    const result = await service.verifyTxtRecord(DOMAIN, TOKEN);

    expect(result).toBe(false);
  });

  it('returns false when TXT record has wrong value', async () => {
    mockResolveTxt.mockResolvedValue([['branivo-verify=wrongtoken']]);

    const result = await service.verifyTxtRecord(DOMAIN, TOKEN);

    expect(result).toBe(false);
  });

  it('returns false when TXT records array is empty', async () => {
    mockResolveTxt.mockResolvedValue([]);

    const result = await service.verifyTxtRecord(DOMAIN, TOKEN);

    expect(result).toBe(false);
  });

  it('returns false on unexpected error without throwing', async () => {
    const err = Object.assign(new Error('Unknown'), { code: 'UNKNOWN' });
    mockResolveTxt.mockRejectedValue(err);

    const result = await service.verifyTxtRecord(DOMAIN, TOKEN);

    expect(result).toBe(false);
  });
});
