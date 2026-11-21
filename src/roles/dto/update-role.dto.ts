import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRoleDto {
  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'El nombre del rol no puede exceder 100 caracteres' })
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'La descripción no puede exceder 500 caracteres' })
  description?: string;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(100, { message: 'Demasiados permisos' })
  @IsString({ each: true })
  @MaxLength(100, { each: true, message: 'Cada permiso puede tener hasta 100 caracteres' })
  permissions?: string[];
}
