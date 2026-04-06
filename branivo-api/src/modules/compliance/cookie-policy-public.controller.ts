import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { CookiePolicyService } from './cookie-policy.service';
import { CookiePolicyResponseDto } from './dto/cookie-policy-response.dto';

const SUPPORTED_LANGUAGES = ['bg', 'en'] as const;
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

@Controller('public')
export class CookiePolicyPublicController {
  constructor(private readonly cookiePolicyService: CookiePolicyService) {}

  @Get('cookie-policy')
  async getPublished(
    @Query('lang') lang: string = 'bg',
  ): Promise<CookiePolicyResponseDto> {
    if (!SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)) {
      throw new BadRequestException(
        `Unsupported language "${lang}". Supported: ${SUPPORTED_LANGUAGES.join(', ')}`,
      );
    }
    return this.cookiePolicyService.getPublished(lang);
  }
}
