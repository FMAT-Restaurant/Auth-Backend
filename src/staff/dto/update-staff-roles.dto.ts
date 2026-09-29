import { ArrayNotEmpty, IsArray, IsEnum } from 'class-validator';
import { RoleEnum } from '../../database/entities/role.entity';

export class UpdateStaffRolesDto {
  @IsArray({ message: 'Los roles deben ser proporcionados en un arreglo' })
  @ArrayNotEmpty({ message: 'El personal debe conservar al menos un rol operativo' })
  @IsEnum(RoleEnum, {
    each: true,
    message:
      'Cada rol debe ser válido: HOST, ALMACENISTA, MESERO, CHEF_MASTER',
  })
  roles: RoleEnum[];
}
