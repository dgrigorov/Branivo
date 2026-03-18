import { IsIn } from 'class-validator';
import { UserRole } from '../entities/user.entity';

export class UpdateUserRoleDto {
  @IsIn(['broker_agent', 'broker_viewer', 'broker_admin'])
  role!: Extract<UserRole, 'broker_agent' | 'broker_viewer' | 'broker_admin'>;
}
