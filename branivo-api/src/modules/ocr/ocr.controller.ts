import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { OcrService } from './ocr.service';
import { OcrScanResponseDto, ReportMlKitScanDto } from './dto/ocr-scan.dto';
import { OcrStatusResponseDto } from './dto/ocr-status.dto';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('ocr')
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  @Post('scan')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseInterceptors(
    FilesInterceptor('images', 3, {
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `Неподдържан тип файл: ${file.mimetype}. Използвайте JPEG, PNG или WEBP.`,
            ),
            false,
          );
        }
      },
    }),
  )
  async scan(
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: Request,
  ): Promise<OcrScanResponseDto> {
    if (!files || files.length < 2) {
      throw new BadRequestException('Необходими са поне 2 изображения.');
    }

    const sessionToken = req.headers['x-session-token'] as string | undefined;
    if (!sessionToken || !UUID_REGEX.test(sessionToken)) {
      throw new BadRequestException(
        'Невалиден или липсващ X-Session-Token header.',
      );
    }

    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      '0.0.0.0';

    const imageBuffers = files.map((f) => f.buffer);
    return this.ocrService.scan(imageBuffers, sessionToken, clientIp);
  }

  @Post('report-mlkit-scan')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async reportMlKitScan(
    @Body() dto: ReportMlKitScanDto,
  ): Promise<OcrScanResponseDto> {
    return this.ocrService.reportMlKitScan(dto);
  }

  @Get('status/:jobId')
  async getStatus(
    @Param('jobId') jobId: string,
  ): Promise<OcrStatusResponseDto> {
    return this.ocrService.getStatus(jobId);
  }
}
