import { IsIn, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class RegisterPushSubscriptionDto {
  @IsUrl({}, { message: 'endpoint трябва да е валиден URL' })
  endpoint!: string;

  @IsString()
  @IsNotEmpty({ message: 'p256dh не може да е празен' })
  p256dh!: string;

  @IsString()
  @IsNotEmpty({ message: 'auth не може да е празен' })
  auth!: string;

  @IsOptional()
  @IsIn(['web', 'fcm'])
  type?: 'web' | 'fcm';
}
