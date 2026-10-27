import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RequestPasswordResetDto {
  @IsNotEmpty({ message: 'El identificador o matrícula es obligatorio' })
  @IsString({ message: 'El identificador debe ser una cadena de texto' })
  @MaxLength(150, { message: 'El identificador es demasiado largo' })
  identifier: string;
}
