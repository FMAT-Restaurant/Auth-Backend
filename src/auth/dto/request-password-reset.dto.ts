import { IsNotEmpty, IsString } from 'class-validator';

export class RequestPasswordResetDto {
  @IsNotEmpty({ message: 'El identificador o matrícula es obligatorio' })
  @IsString({ message: 'El identificador debe ser una cadena de texto' })
  identifier: string;
}
