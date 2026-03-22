import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DisableInsurerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
