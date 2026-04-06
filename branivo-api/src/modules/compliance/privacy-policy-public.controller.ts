import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { PrivacyPolicyService } from './privacy-policy.service';
import { PrivacyPolicyResponseDto } from './dto/privacy-policy-response.dto';

const SUPPORTED_LANGUAGES = ['bg', 'en'] as const;
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

@Controller('public')
export class PrivacyPolicyPublicController {
  constructor(private readonly privacyPolicyService: PrivacyPolicyService) {}

  @Get('privacy-policy')
  async getPublished(
    @Query('lang') lang: string = 'bg',
  ): Promise<PrivacyPolicyResponseDto> {
    if (!SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)) {
      throw new BadRequestException(
        `Unsupported language "${lang}". Supported: ${SUPPORTED_LANGUAGES.join(', ')}`,
      );
    }
    return this.privacyPolicyService.getPublished(lang);
  }
}
