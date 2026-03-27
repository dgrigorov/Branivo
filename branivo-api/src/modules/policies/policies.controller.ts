import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesRepository } from './policies.repository';
import { S3Service } from '../../infrastructure/s3/s3.service';
import { ShipmentsRepository } from '../logistics/shipments.repository';
import { PoliciesService, PolicyDetailsDto } from './policies.service';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';

export class PolicyDocumentsResponseDto {
  policyPdfUrl!: string;
  greenCardUrl!: string;
  expiresAt!: string;
}

export class PolicyShipmentResponseDto {
  shipmentId!: string;
  provider!: 'speedy' | 'econt' | 'manual';
  trackingNumber!: string | null;
  estimatedDeliveryDate!: string | null;
  status!: 'pending' | 'dispatched' | 'delivered' | 'failed';
  createdAt!: string;
}

@Controller('policies')
export class PoliciesController {
  constructor(
    private readonly policiesService: PoliciesService,
    private readonly policiesRepo: PoliciesRepository,
    private readonly s3Service: S3Service,
    private readonly shipmentsRepo: ShipmentsRepository,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async listPolicies(): Promise<PolicyDetailsDto[]> {
    return this.policiesService.listPoliciesDetailed();
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async createPolicy(@Body() dto: CreatePolicyDto): Promise<PolicyDetailsDto> {
    return this.policiesService.createPolicy(dto);
  }

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

  @UseGuards(JwtAuthGuard)
  @Get(':id/shipment')
  async getShipment(
    @Param('id') id: string,
  ): Promise<PolicyShipmentResponseDto> {
    const policy = await this.policiesRepo.findByIdForTenant(id);
    if (!policy) {
      throw new NotFoundException('Policy not found');
    }

    const shipment = await this.shipmentsRepo.findByPolicyIdForTenant(
      policy.tenantId,
      id,
    );

    if (!shipment) {
      throw new NotFoundException('No shipment found for this policy');
    }

    return {
      shipmentId: shipment.id,
      provider: shipment.provider,
      trackingNumber: shipment.trackingNumber,
      estimatedDeliveryDate: shipment.estimatedDeliveryDate
        ? shipment.estimatedDeliveryDate.toISOString().split('T')[0]
        : null,
      status: shipment.status,
      createdAt: shipment.createdAt.toISOString(),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getPolicy(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PolicyDetailsDto> {
    return this.policiesService.getPolicyDetailedById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async updatePolicy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePolicyDto,
  ): Promise<PolicyDetailsDto> {
    return this.policiesService.updatePolicy(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePolicy(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.policiesService.deletePolicy(id);
  }
}
