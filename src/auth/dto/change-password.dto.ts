import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsStrongPassword } from '../../common/validation/password.validation';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'La contraseña actual es obligatoria' })
  @MaxLength(128, { message: 'La contraseña actual es demasiado larga' })
  currentPassword: string;

  @IsString()
  @IsStrongPassword()
  newPassword: string;
}
