import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { NoSurroundingWhitespace } from '../../common/validation/password.validation';

export class SetupAdminDto {
  @IsEmail({}, { message: 'Debe proporcionar un correo electrónico válido' })
  @IsNotEmpty({ message: 'El correo electrónico del administrador es obligatorio' })
  @MaxLength(150, { message: 'El correo es demasiado largo' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(72, { message: 'La contraseña no puede exceder 72 caracteres' })
  @NoSurroundingWhitespace()
  password: string;

  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres' })
  firstName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'Los apellidos no pueden exceder 100 caracteres' })
  lastName?: string;
}
