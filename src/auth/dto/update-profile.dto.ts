import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: 'Los apellidos son obligatorios' })
  lastName: string;

  @IsString()
  @IsOptional()
  phone?: string;
}
