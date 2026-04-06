import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { TosService } from './tos.service';
import { TosResponseDto } from './dto/tos-response.dto';

const SUPPORTED_LANGUAGES = ['bg', 'en'] as const;
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

@Controller('public')
export class TosPublicController {
  constructor(private readonly tosService: TosService) {}

  @Get('tos')
  async getPublished(
    @Query('lang') lang: string = 'bg',
  ): Promise<TosResponseDto> {
    if (!SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)) {
      throw new BadRequestException(
        `Unsupported language "${lang}". Supported: ${SUPPORTED_LANGUAGES.join(', ')}`,
      );
    }
    return this.tosService.getPublished(lang);
  }
}
