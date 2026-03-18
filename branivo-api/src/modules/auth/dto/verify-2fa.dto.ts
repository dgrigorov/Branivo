import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumberString, IsString, Length } from 'class-validator';

export class Verify2FADto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  temp_token!: string;

  @ApiProperty({ example: '123456' })
  @IsNumberString()
  @Length(6, 6)
  otp_code!: string;
}
