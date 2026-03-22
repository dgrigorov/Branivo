import {
  Controller,
  Get,
  Logger,
  NotFoundException,
  Res,
  VERSION_NEUTRAL,
  Version,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fsPromises from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';
import type { Response } from 'express';

@Controller()
export class WellKnownController {
  private readonly logger = new Logger(WellKnownController.name);

  constructor(private readonly config: ConfigService) {}

  @Get('.well-known/apple-developer-merchantid-domain-association')
  @Version(VERSION_NEUTRAL)
  async serveApplePayDomainAssociation(@Res() res: Response): Promise<void> {
    // Try env variable first (resolve path to prevent traversal), then assets folder
    const envFilePath = this.config.get<string>(
      'APPLE_PAY_DOMAIN_ASSOCIATION_FILE',
    );

    const candidates: string[] = [];
    if (envFilePath) {
      candidates.push(path.resolve(envFilePath));
    }
    candidates.push(
      path.resolve(
        process.cwd(),
        'assets',
        'apple-developer-merchantid-domain-association',
      ),
    );

    let filePath: string | undefined;
    for (const candidate of candidates) {
      try {
        await fsPromises.access(candidate, fs.constants.R_OK);
        filePath = candidate;
        break;
      } catch {
        // Not accessible — try next
      }
    }

    if (!filePath) {
      this.logger.warn(
        'Apple Pay domain association file not found — returning 404',
      );
      throw new NotFoundException(
        'Apple Pay domain association file not configured',
      );
    }

    const content = await fsPromises.readFile(filePath);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(content);
  }
}
