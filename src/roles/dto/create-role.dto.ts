import { IsString, IsNotEmpty, IsOptional, IsArray, ArrayNotEmpty, Matches } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del rol es obligatorio' })
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'El código del rol solo puede contener letras mayúsculas, números y guiones bajos (ej. ROL_BARISTA)',
  })
  code?: string;

  @IsArray({ message: 'Los permisos deben ser proporcionados en un arreglo' })
  @ArrayNotEmpty({ message: 'Debe seleccionar al menos un permiso para el rol' })
  @IsString({ each: true, message: 'Cada permiso debe ser una cadena válida' })
  permissions: string[];
}
