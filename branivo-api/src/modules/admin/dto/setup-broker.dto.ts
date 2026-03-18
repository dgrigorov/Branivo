import { IsNotEmpty, Matches, MinLength } from 'class-validator';

export class SetupBrokerDto {
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d])/, {
    message:
      'password must contain at least 1 uppercase letter, 1 digit, and 1 special character',
  })
  password!: string;
}
