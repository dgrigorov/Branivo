import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UsersService } from './users.service';
import { UserResponseDto } from './dto/user-response.dto';
import { CreateBrokerUserDto } from './dto/create-broker-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

interface RequestWithUser {
  user: AuthenticatedUser;
}

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('broker_admin')
  @ApiOperation({ summary: 'List users in current tenant' })
  async findAll(): Promise<UserResponseDto[]> {
    const users = await this.usersService.findAll();
    return users.map((u) => UserResponseDto.fromEntity(u));
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@Req() req: RequestWithUser): {
    userId: string;
    tenantId: string;
    role: string;
  } {
    return {
      userId: req.user.userId,
      tenantId: req.user.tenantId,
      role: req.user.role,
    };
  }

  @Post()
  @Roles('broker_admin')
  @ApiOperation({ summary: 'Create a new broker user in current tenant' })
  async create(@Body() dto: CreateBrokerUserDto): Promise<UserResponseDto> {
    const user = await this.usersService.createBrokerUser(dto);
    return UserResponseDto.fromEntity(user);
  }

  @Put(':id/role')
  @Roles('broker_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update role of a user in current tenant' })
  async updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
    @Req() req: RequestWithUser,
  ): Promise<{ message: string }> {
    if (id === req.user.userId) {
      throw new BadRequestException('Cannot change your own role');
    }
    await this.usersService.updateRole(id, dto.role);
    return { message: 'Role updated successfully' };
  }

  @Delete(':id')
  @Roles('broker_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a user in current tenant' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestWithUser,
  ): Promise<{ message: string }> {
    if (id === req.user.userId) {
      throw new BadRequestException('Cannot delete your own account');
    }
    await this.usersService.softDeleteUser(id);
    return { message: 'User deleted successfully' };
  }
}
