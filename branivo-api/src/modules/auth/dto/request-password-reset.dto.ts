import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

export class RequestPasswordResetDto {
  @ApiProperty({ example: 'broker@example.com' })
  @Transform(({ value }: { value: string }) => value.toLowerCase())
  @IsEmail({}, { message: 'Невалиден имейл адрес' })
  email!: string;
}
