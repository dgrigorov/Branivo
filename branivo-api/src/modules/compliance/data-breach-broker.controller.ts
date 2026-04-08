import {
  Controller,
  ForbiddenException,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { DataBreachService } from './data-breach.service';
import { DataBreachResponseDto } from './dto/data-breach-response.dto';

@Controller('tenants/data-breaches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DataBreachBrokerController {
  constructor(
    private readonly dataBreachService: DataBreachService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles('broker_admin', 'broker_agent')
  async list(): Promise<DataBreachResponseDto[]> {
    const tenantId = this.tenantContext.getTenantId();
    return this.dataBreachService.getBrokerBreaches(tenantId);
  }

  @Post()
  @Roles('broker_admin', 'broker_agent')
  create(): never {
    throw new ForbiddenException(
      'Only Super Admin can register data breaches.',
    );
  }
}
