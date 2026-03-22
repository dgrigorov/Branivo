import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailChannel } from './email.channel';
import { EmailService } from '../../../infrastructure/email/email.service';

const mockSendMail = jest.fn().mockResolvedValue(undefined);

const mockEmailService = {
  transporter: { sendMail: mockSendMail },
};

const mockConfig = {
  get: jest.fn().mockReturnValue(undefined),
};

describe('EmailChannel', () => {
  let channel: EmailChannel;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailChannel,
        { provide: EmailService, useValue: mockEmailService },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    channel = module.get<EmailChannel>(EmailChannel);
  });

  it('delegates to emailService.transporter.sendMail with correct params', async () => {
    await channel.send({
      to: 'client@example.com',
      subject: 'Напомняне',
      html: '<p>Полица изтича</p>',
      tenantName: 'Demo Broker',
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'client@example.com',
        subject: 'Напомняне',
        html: '<p>Полица изтича</p>',
      }),
    );
  });

  it('uses SMTP_FROM from config when available', async () => {
    mockConfig.get.mockReturnValue('custom@broker.com');

    await channel.send({
      to: 'client@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      tenantName: 'Demo Broker',
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'custom@broker.com' }),
    );
  });

  it('falls back to tenantName default from when SMTP_FROM not configured', async () => {
    mockConfig.get.mockReturnValue(undefined);

    await channel.send({
      to: 'client@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      tenantName: 'My Broker',
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'My Broker <noreply@branivo.com>',
      }),
    );
  });
});
