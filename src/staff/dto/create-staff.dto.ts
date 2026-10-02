import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { RoleEnum } from '../../database/entities/role.entity';

export class CreateStaffDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: 'El apellido es obligatorio' })
  lastName: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsArray({ message: 'Los roles deben ser proporcionados en un arreglo' })
  @ArrayNotEmpty({ message: 'Debe asignar al menos un rol operativo al empleado' })
  @IsString({ each: true, message: 'Cada rol debe ser una clave o código de rol válido' })
  roles: string[];

  @IsString()
  @IsOptional()
  @MinLength(6, {
    message: 'La contraseña temporal debe tener al menos 6 caracteres',
  })
  initialPassword?: string;
}
