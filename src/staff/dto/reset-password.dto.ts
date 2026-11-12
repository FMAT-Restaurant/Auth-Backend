import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { NoSurroundingWhitespace } from '../../common/validation/password.validation';

export class ResetPasswordDto {
  @IsString()
  @IsOptional()
  @MinLength(6, {
    message: 'La nueva contraseña temporal debe tener al menos 6 caracteres',
  })
  @MaxLength(72, { message: 'La contraseña temporal no puede exceder 72 caracteres' })
  @NoSurroundingWhitespace()
  temporaryPassword?: string;
}
