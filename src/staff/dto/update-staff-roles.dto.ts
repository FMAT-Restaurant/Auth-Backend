import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class UpdateStaffRolesDto {
  @IsArray({ message: 'Los roles deben ser proporcionados en un arreglo' })
  @ArrayNotEmpty({ message: 'El personal debe conservar al menos un rol operativo' })
  @IsString({ each: true, message: 'Cada rol debe ser una clave o código de rol válido' })
  roles: string[];
}
