import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesRepository } from './policies.repository';
import { S3Service } from '../../infrastructure/s3/s3.service';

export class PolicyDocumentsResponseDto {
  policyPdfUrl!: string;
  greenCardUrl!: string;
  expiresAt!: string;
}

@Controller('policies')
export class PoliciesController {
  constructor(
    private readonly policiesRepo: PoliciesRepository,
    private readonly s3Service: S3Service,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get(':id/documents')
  async getDocuments(
    @Param('id') id: string,
  ): Promise<PolicyDocumentsResponseDto> {
    const policy = await this.policiesRepo.findByIdForTenant(id);

    if (!policy || !policy.policyPdfS3Key || !policy.greenCardPdfS3Key) {
      throw new NotFoundException(
        'Policy documents not yet generated for this policy',
      );
    }

    const ttlSeconds = 900;
    const [policyPdfUrl, greenCardUrl] = await Promise.all([
      this.s3Service.generatePresignedUrl(policy.policyPdfS3Key, ttlSeconds),
      this.s3Service.generatePresignedUrl(policy.greenCardPdfS3Key, ttlSeconds),
    ]);

    return {
      policyPdfUrl,
      greenCardUrl,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    };
  }
}
