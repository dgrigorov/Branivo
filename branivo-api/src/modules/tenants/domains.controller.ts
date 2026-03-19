import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { DomainsService } from './domains.service';
import { RegisterDomainDto } from './dto/register-domain.dto';
import { DomainResponseDto } from './dto/domain-response.dto';

@ApiTags('tenants')
@Controller('tenants/domains')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('broker_admin')
export class DomainsController {
  constructor(private readonly domainsService: DomainsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a custom domain for the tenant' })
  async registerDomain(
    @Body() dto: RegisterDomainDto,
  ): Promise<{ data: DomainResponseDto }> {
    const data = await this.domainsService.registerDomain(dto);
    return { data };
  }

  @Get()
  @ApiOperation({ summary: 'List all domains for the tenant' })
  async listDomains(): Promise<{ data: DomainResponseDto[] }> {
    const data = await this.domainsService.listDomains();
    return { data };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a custom domain' })
  async deleteDomain(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.domainsService.deleteDomain(id);
  }
}
