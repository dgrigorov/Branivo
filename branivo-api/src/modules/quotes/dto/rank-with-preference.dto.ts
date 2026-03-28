import { IsString, MinLength, MaxLength } from 'class-validator';

export class RankWithPreferenceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  preference!: string;
}
