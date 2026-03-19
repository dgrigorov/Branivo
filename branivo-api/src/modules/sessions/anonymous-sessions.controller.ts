import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { AnonymousSessionsService } from './anonymous-sessions.service';
import { CreateSessionResponseDto } from './dto/create-session-response.dto';
import { UpdateAnonSessionDto } from './dto/update-anon-session.dto';
import { AnonSessionData } from './interfaces/anon-session.interface';

@ApiTags('sessions')
@Throttle({ public: { ttl: 60000, limit: 10 } })
@Controller('sessions/anonymous')
export class AnonymousSessionsController {
  constructor(
    private readonly sessionsService: AnonymousSessionsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create anonymous session' })
  @ApiResponse({ status: 201, type: CreateSessionResponseDto })
  async createSession(): Promise<CreateSessionResponseDto> {
    const tenantId = this.tenantContext.getTenantId();
    return this.sessionsService.createSession(tenantId);
  }

  @Get(':sessionId')
  @ApiOperation({ summary: 'Get anonymous session' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async getSession(
    @Param('sessionId') sessionId: string,
  ): Promise<AnonSessionData> {
    const tenantId = this.tenantContext.getTenantId();
    const session = await this.sessionsService.getSession(sessionId, tenantId);
    if (!session) {
      throw new NotFoundException('Session not found or expired');
    }
    return session;
  }

  @Put(':sessionId/data')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update anonymous session data' })
  @ApiResponse({ status: 200 })
  async updateSessionData(
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateAnonSessionDto,
  ): Promise<void> {
    const tenantId = this.tenantContext.getTenantId();
    await this.sessionsService.updateSessionData(sessionId, tenantId, dto);
  }

  @Post(':sessionId/migrate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Migrate anonymous session to authenticated user' })
  @ApiResponse({ status: 200 })
  async migrateSession(
    @Param('sessionId') sessionId: string,
    @Request() req: { user: { sub: string } },
  ): Promise<AnonSessionData> {
    const tenantId = this.tenantContext.getTenantId();
    return this.sessionsService.migrateSession(
      sessionId,
      tenantId,
      req.user.sub,
    );
  }
}
