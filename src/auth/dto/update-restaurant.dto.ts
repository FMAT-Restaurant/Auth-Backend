import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateRestaurantDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del restaurante es obligatorio' })
  name: string;

  @IsString()
  @IsOptional()
  commercialName?: string;

  @IsString()
  @IsOptional()
  address?: string;
}
