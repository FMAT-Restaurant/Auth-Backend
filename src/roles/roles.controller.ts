import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RoleEnum } from '../database/entities/role.entity';

@Controller('api/v1/roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMINISTRADOR)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('catalog')
  getPermissionsCatalog() {
    return this.rolesService.getPermissionsCatalog();
  }

  @Get()
  async findAllRoles() {
    return this.rolesService.findAllRoles();
  }

  @Get(':code')
  async findRoleByCode(@Param('code') code: string) {
    return this.rolesService.findRoleByCode(code);
  }

  @Post()
  async createRole(@Body() dto: CreateRoleDto) {
    return this.rolesService.createRole(dto);
  }

  @Patch(':code')
  async updateRole(
    @Param('code') code: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rolesService.updateRole(code, dto);
  }

  @Delete(':code')
  async deleteRole(@Param('code') code: string) {
    return this.rolesService.deleteRole(code);
  }
}
