import { IsIn, IsOptional, IsString, IsUrl } from 'class-validator';

export class RegisterPushSubscriptionDto {
  @IsUrl({}, { message: 'endpoint трябва да е валиден URL' })
  endpoint!: string;

  @IsString()
  p256dh!: string;

  @IsString()
  auth!: string;

  @IsOptional()
  @IsIn(['web', 'fcm'])
  type?: 'web' | 'fcm';
}
