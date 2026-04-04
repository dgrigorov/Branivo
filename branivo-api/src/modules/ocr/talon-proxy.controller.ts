import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import axios from 'axios';
import FormData from 'form-data';
import type { Request, Response } from 'express';

const OCR_SERVICE_URL = 'http://localhost:8888';
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

@Controller('ocr')
export class TalonProxyController {
  @Post('talon')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(`Неподдържан тип файл: ${file.mimetype}`),
            false,
          );
        }
      },
    }),
  )
  async proxyTalon(
    @UploadedFile() file: Express.Multer.File,
    @Query('step') step: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!file) {
      throw new BadRequestException('Необходимо е изображение (image).');
    }

    const form = new FormData();
    form.append('image', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });

    const params = step ? `?step=${encodeURIComponent(step)}` : '';
    const response = await axios.post<unknown>(
      `${OCR_SERVICE_URL}/ocr/talon${params}`,
      form,
      { headers: form.getHeaders(), responseType: 'json', timeout: 60000 },
    );

    res.status(response.status).json(response.data);
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(`Неподдържан тип файл: ${file.mimetype}`),
            false,
          );
        }
      },
    }),
  )
  async proxyPreview(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!file) {
      throw new BadRequestException('Необходимо е изображение (image).');
    }

    const form = new FormData();
    form.append('image', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });

    // Forward points[] query params
    const pointsParam = (req.query['points[]'] ?? req.query['points']) as
      | string
      | string[]
      | undefined;
    if (pointsParam) {
      const arr = Array.isArray(pointsParam) ? pointsParam : [pointsParam];
      const qs = arr.map((p) => `points[]=${encodeURIComponent(p)}`).join('&');
      const response = await axios.post<unknown>(
        `${OCR_SERVICE_URL}/ocr/preview?${qs}`,
        form,
        { headers: form.getHeaders(), responseType: 'json', timeout: 30000 },
      );
      res.status(response.status).json(response.data);
      return;
    }

    const response = await axios.post<unknown>(
      `${OCR_SERVICE_URL}/ocr/preview`,
      form,
      { headers: form.getHeaders(), responseType: 'json', timeout: 30000 },
    );
    res.status(response.status).json(response.data);
  }

  @Post('debug/pipeline')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(`Неподдържан тип файл: ${file.mimetype}`),
            false,
          );
        }
      },
    }),
  )
  async proxyDebugPipeline(
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response,
  ): Promise<void> {
    if (!file) {
      throw new BadRequestException('Необходимо е изображение (image).');
    }

    const form = new FormData();
    form.append('image', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });

    try {
      const response = await axios.post<unknown>(
        `${OCR_SERVICE_URL}/ocr/debug/pipeline`,
        form,
        { headers: form.getHeaders(), responseType: 'json', timeout: 60000 },
      );
      res.status(response.status).json(response.data);
    } catch {
      throw new InternalServerErrorException('OCR service unavailable');
    }
  }
}
