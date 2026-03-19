import { IsString, Matches } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Невалиден телефонен номер' })
  phone_number!: string;
}
