import { UserRole } from '../entities/user.entity';

export class UserResponseDto {
  id!: string;
  tenantId!: string;
  email!: string;
  role!: UserRole;
  twoFaEnabled!: boolean;
  createdAt!: Date;

  static fromEntity(user: {
    id: string;
    tenantId: string;
    email: string;
    role: UserRole;
    twoFaEnabled: boolean;
    createdAt: Date;
  }): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.tenantId = user.tenantId;
    dto.email = user.email;
    dto.role = user.role;
    dto.twoFaEnabled = user.twoFaEnabled;
    dto.createdAt = user.createdAt;
    return dto;
  }
}
