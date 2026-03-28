import { IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';

export class SetApiKeyDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(500)
  apiKey!: string;
}
