import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, MinLength } from 'class-validator';

export class VerifyPasswordResetOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsString()
  @MinLength(3)
  readonly emailOrPhone!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  readonly otp!: string;
}
