import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import * as fsPromises from 'fs/promises';
import { WellKnownController } from './well-known.controller';

jest.mock('fs/promises');
const mockFsPromises = jest.mocked(fsPromises);

const mockConfig = {
  get: jest.fn(),
};

describe('WellKnownController', () => {
  let controller: WellKnownController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WellKnownController],
      providers: [{ provide: ConfigService, useValue: mockConfig }],
    }).compile();

    controller = module.get<WellKnownController>(WellKnownController);
  });

  describe('serveApplePayDomainAssociation', () => {
    it('returns file content with application/octet-stream when file exists', async () => {
      const fileContent = Buffer.from('apple-pay-domain-association-content');
      mockConfig.get.mockReturnValue(undefined);
      mockFsPromises.access.mockResolvedValue(undefined);
      mockFsPromises.readFile.mockResolvedValue(fileContent);

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };

      await controller.serveApplePayDomainAssociation(
        mockRes as unknown as import('express').Response,
      );

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/octet-stream',
      );
      expect(mockRes.send).toHaveBeenCalledWith(fileContent);
    });

    it('uses env variable path when APPLE_PAY_DOMAIN_ASSOCIATION_FILE is set', async () => {
      const envPath = '/custom/path/apple-association';
      const fileContent = Buffer.from('env-file-content');
      mockConfig.get.mockReturnValue(envPath);
      mockFsPromises.access.mockResolvedValue(undefined);
      mockFsPromises.readFile.mockResolvedValue(fileContent);

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };

      await controller.serveApplePayDomainAssociation(
        mockRes as unknown as import('express').Response,
      );

      expect(mockFsPromises.readFile).toHaveBeenCalledWith(
        expect.stringContaining('apple-association'),
      );
      expect(mockRes.send).toHaveBeenCalledWith(fileContent);
    });

    it('throws NotFoundException when no file is found', async () => {
      mockConfig.get.mockReturnValue(undefined);
      mockFsPromises.access.mockRejectedValue(new Error('ENOENT'));

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };

      await expect(
        controller.serveApplePayDomainAssociation(
          mockRes as unknown as import('express').Response,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(mockRes.send).not.toHaveBeenCalled();
    });
  });
});
