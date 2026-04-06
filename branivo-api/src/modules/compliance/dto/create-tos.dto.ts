import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTosDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100_000)
  content!: string;

  @IsOptional()
  @IsString()
  @IsIn(['bg', 'en'])
  language: string = 'bg';
}
