import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NoSurroundingWhitespace } from '../../common/validation/password.validation';

export class CreateStaffDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres' })
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: 'El apellido es obligatorio' })
  @MaxLength(100, { message: 'El apellido no puede exceder 100 caracteres' })
  lastName: string;

  @IsString()
  @IsOptional()
  @MaxLength(30, { message: 'El teléfono no puede exceder 30 caracteres' })
  phone?: string;

  @IsArray({ message: 'Los roles deben ser proporcionados en un arreglo' })
  @ArrayNotEmpty({ message: 'Debe asignar al menos un rol operativo al empleado' })
  @ArrayMaxSize(10, { message: 'No se pueden asignar más de 10 roles' })
  @IsString({ each: true, message: 'Cada rol debe ser una clave o código de rol válido' })
  @MaxLength(50, { each: true, message: 'Cada código de rol puede tener hasta 50 caracteres' })
  roles: string[];

  @IsString()
  @IsOptional()
  @MinLength(6, {
    message: 'La contraseña temporal debe tener al menos 6 caracteres',
  })
  @MaxLength(72, { message: 'La contraseña temporal no puede exceder 72 caracteres' })
  @NoSurroundingWhitespace()
  initialPassword?: string;
}
