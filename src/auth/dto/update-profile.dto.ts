import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres' })
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: 'Los apellidos son obligatorios' })
  @MaxLength(100, { message: 'Los apellidos no pueden exceder 100 caracteres' })
  lastName: string;

  @IsString()
  @IsOptional()
  @MaxLength(30, { message: 'El teléfono no puede exceder 30 caracteres' })
  phone?: string;
}
