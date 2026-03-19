import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Невалиден телефонен номер' })
  phone_number!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'OTP трябва да е 6 цифри' })
  otp_code!: string;

  @IsOptional()
  @IsUUID()
  session_id?: string;
}
