import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'El identificador (correo o Staff ID) es obligatorio' })
  @MaxLength(150, { message: 'El identificador es demasiado largo' })
  identifier: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  @MaxLength(128, { message: 'La contraseña es demasiado larga' })
  password: string;
}
