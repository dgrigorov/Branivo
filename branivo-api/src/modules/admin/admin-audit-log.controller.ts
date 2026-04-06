import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditService, AuditChainVerificationResult } from '../../common/audit';

class VerifyChainQueryDto {
  @IsUUID()
  tenantId!: string;
}

@Controller('admin/audit-log')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminAuditLogController {
  constructor(private readonly auditService: AuditService) {}

  @Get('verify-chain')
  async verifyChain(
    @Query() query: VerifyChainQueryDto,
  ): Promise<AuditChainVerificationResult> {
    return this.auditService.verifyChain(query.tenantId);
  }
}
