import { IsUUID } from 'class-validator';

export class AcceptTosDto {
  @IsUUID()
  tosVersionId!: string;
}
