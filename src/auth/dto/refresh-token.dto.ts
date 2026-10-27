import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty({ message: 'El refresh token es obligatorio' })
  @MaxLength(256)
  refreshToken: string;
}
