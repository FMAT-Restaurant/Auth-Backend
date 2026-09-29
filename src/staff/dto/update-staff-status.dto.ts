import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateStaffStatusDto {
  @IsBoolean({ message: 'El estado isActive debe ser booleano' })
  @IsNotEmpty({ message: 'El campo isActive es obligatorio' })
  isActive: boolean;
}
