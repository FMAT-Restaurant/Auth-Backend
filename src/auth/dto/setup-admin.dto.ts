import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsStrongPassword } from '../../common/validation/password.validation';

export class SetupAdminDto {
  @IsEmail({}, { message: 'Debe proporcionar un correo electrónico válido' })
  @IsNotEmpty({ message: 'El correo electrónico del administrador es obligatorio' })
  @MaxLength(150, { message: 'El correo es demasiado largo' })
  email: string;

  @IsString()
  @IsStrongPassword()
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
