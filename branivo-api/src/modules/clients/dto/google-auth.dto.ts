import { IsOptional, IsString, IsUUID } from 'class-validator';

export class GoogleAuthDto {
  @IsString()
  id_token!: string;

  @IsOptional()
  @IsUUID()
  session_id?: string;
}
