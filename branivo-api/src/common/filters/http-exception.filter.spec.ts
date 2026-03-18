import { HttpExceptionFilter } from './http-exception.filter';
import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: { status: jest.Mock; json: jest.Mock };
  let mockRequest: {
    url: string;
    method: string;
    tenantId?: string;
    traceId?: string;
    userId?: string;
  };

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockRequest = { url: '/test', method: 'GET' };
  });

  function createHost(): ArgumentsHost {
    return {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost;
  }

  it('returns RFC 7807 format for HttpException', () => {
    const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);
    filter.catch(exception, createHost());

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    const body = (
      mockResponse.json.mock.calls[0] as [Record<string, unknown>]
    )[0];
    expect(body).toMatchObject({
      statusCode: 404,
      message: 'Not Found',
      error: 'HttpException',
      path: '/test',
    });
    expect(body.timestamp).toBeDefined();
    expect(body).not.toHaveProperty('stack');
  });

  it('returns 500 for unknown errors', () => {
    filter.catch(new Error('Unexpected'), createHost());

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    const body = (
      mockResponse.json.mock.calls[0] as [Record<string, unknown>]
    )[0];
    expect(body.statusCode).toBe(500);
    expect(body).not.toHaveProperty('stack');
  });

  it('includes tenant_id in response when available', () => {
    mockRequest.tenantId = 'tenant-uuid';
    const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    filter.catch(exception, createHost());

    const body = (
      mockResponse.json.mock.calls[0] as [Record<string, unknown>]
    )[0];
    expect(body.tenant_id).toBe('tenant-uuid');
  });
});
