import { IsOptional, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsOptional()
  @MinLength(6, {
    message: 'La nueva contraseña temporal debe tener al menos 6 caracteres',
  })
  temporaryPassword?: string;
}
