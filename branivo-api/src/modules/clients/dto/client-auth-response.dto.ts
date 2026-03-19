export class ClientUserDto {
  id!: string;
  phone_number!: string;
  is_new!: boolean;
}

export class ClientAuthResponseDto {
  access_token!: string;
  refresh_token!: string;
  user!: ClientUserDto;
}
