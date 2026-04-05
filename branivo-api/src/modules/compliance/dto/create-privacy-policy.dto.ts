import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreatePrivacyPolicyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100_000)
  content!: string;

  @IsOptional()
  @IsString()
  @IsIn(['bg', 'en'])
  language: string = 'bg';
}
