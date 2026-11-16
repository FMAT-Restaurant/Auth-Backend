import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del rol es obligatorio' })
  @MaxLength(100, { message: 'El nombre del rol no puede exceder 100 caracteres' })
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'La descripción no puede exceder 500 caracteres' })
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(46, { message: 'El código del rol no puede exceder 46 caracteres' })
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'El código del rol solo puede contener letras mayúsculas, números y guiones bajos (ej. ROL_BARISTA)',
  })
  code?: string;

  @IsArray({ message: 'Los permisos deben ser proporcionados en un arreglo' })
  @ArrayNotEmpty({ message: 'Debe seleccionar al menos un permiso para el rol' })
  @ArrayMaxSize(100, { message: 'Demasiados permisos' })
  @IsString({ each: true, message: 'Cada permiso debe ser una cadena válida' })
  @MaxLength(100, { each: true, message: 'Cada permiso puede tener hasta 100 caracteres' })
  permissions: string[];
}
