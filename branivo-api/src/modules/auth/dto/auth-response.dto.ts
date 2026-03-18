import { ApiProperty } from '@nestjs/swagger';

export class AuthTokensResponseDto {
  @ApiProperty()
  access_token!: string;

  @ApiProperty()
  refresh_token!: string;

  @ApiProperty({ example: 900 })
  expires_in!: number;
}

export class LoginResponseDto {
  @ApiProperty({ required: false })
  access_token?: string;

  @ApiProperty({ required: false })
  refresh_token?: string;

  @ApiProperty({ required: false, example: 900 })
  expires_in?: number;

  @ApiProperty({ required: false })
  requires_2fa?: boolean;

  @ApiProperty({ required: false })
  temp_token?: string;
}
