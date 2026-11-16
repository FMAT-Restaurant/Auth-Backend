import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString, MaxLength } from 'class-validator';

export class UpdateStaffRolesDto {
  @IsArray({ message: 'Los roles deben ser proporcionados en un arreglo' })
  @ArrayNotEmpty({ message: 'El personal debe conservar al menos un rol operativo' })
  @ArrayMaxSize(10, { message: 'No se pueden asignar más de 10 roles' })
  @IsString({ each: true, message: 'Cada rol debe ser una clave o código de rol válido' })
  @MaxLength(50, { each: true, message: 'Cada código de rol puede tener hasta 50 caracteres' })
  roles: string[];
}
