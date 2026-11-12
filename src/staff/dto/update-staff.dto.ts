import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateStaffDto {
  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres' })
  firstName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'El apellido no puede exceder 100 caracteres' })
  lastName?: string;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(10, { message: 'No se pueden asignar más de 10 roles' })
  @IsString({ each: true, message: 'Cada rol debe ser una clave o código de rol válido' })
  @MaxLength(50, { each: true, message: 'Cada código de rol puede tener hasta 50 caracteres' })
  roles?: string[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
