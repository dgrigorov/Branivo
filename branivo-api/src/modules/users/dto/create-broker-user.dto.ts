import { IsEmail, IsIn, IsString, Matches, MinLength } from 'class-validator';
import { UserRole } from '../entities/user.entity';

export class CreateBrokerUserDto {
  @IsEmail()
  email!: string;

  @IsIn(['broker_agent', 'broker_viewer'])
  role!: Extract<UserRole, 'broker_agent' | 'broker_viewer'>;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/, {
    message:
      'Password must contain at least 1 uppercase letter, 1 digit, and 1 special character',
  })
  password!: string;
}
