import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { TenantConfigResponseDto } from './dto/tenant-config-response.dto';

@ApiTags('tenants')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('config')
  @ApiOperation({ summary: 'Get tenant configuration by Host header' })
  async getConfig(): Promise<{ data: TenantConfigResponseDto }> {
    const data = await this.tenantsService.getTenantConfig();
    return { data };
  }
}
