import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RefreshTokenDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El refresh token es obligatorio' })
  @MaxLength(256)
  refreshToken?: string;
}
