import {
  Controller,
  BadRequestException,
  Post,
  Get,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { UpdateStaffRolesDto } from './dto/update-staff-roles.dto';
import { UpdateStaffStatusDto } from './dto/update-staff-status.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TemporaryPasswordGuard } from '../common/guards/temporary-password.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RoleEnum } from '../database/entities/role.entity';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('api/v1/staff')
@UseGuards(JwtAuthGuard, TemporaryPasswordGuard, RolesGuard)
@Roles(RoleEnum.ADMINISTRADOR)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post()
  async createStaff(@Body() dto: CreateStaffDto) {
    return this.staffService.createStaff(dto);
  }

  @Get()
  @RequirePermissions(
    'staff:view',
    'sala:tables:view',
    'sala:tables:occupy',
    'sala:tables:assign_waiter',
  )
  async findAllStaff(
    @Query('role') role?: string,
    @Query('isActive') isActive?: string,
    @Query('passwordResetRequested') passwordResetRequested?: string,
    @CurrentUser('roles') callerRoles?: string[],
  ) {
    const toBool = (value?: string): boolean | undefined => {
      if (value === undefined) return undefined;
      if (value === 'true') return true;
      if (value === 'false') return false;
      throw new BadRequestException(
        `El parámetro booleano debe ser 'true' o 'false', se recibió '${value}'`,
      );
    };
    const isAdmin = Array.isArray(callerRoles) && callerRoles.includes(RoleEnum.ADMINISTRADOR);
    return this.staffService.findAllStaff(
      role,
      toBool(isActive),
      isAdmin ? toBool(passwordResetRequested) : undefined,
      isAdmin,
    );
  }

  @Get(':id')
  async findStaffById(@Param('id') id: string) {
    return this.staffService.findStaffById(id);
  }

  @Put(':id/roles')
  async updateRoles(@Param('id') id: string, @Body() dto: UpdateStaffRolesDto) {
    return this.staffService.updateRoles(id, dto);
  }

  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateStaffStatusDto) {
    return this.staffService.updateStatus(id, dto);
  }

  @Patch(':id')
  async updateStaff(@Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return this.staffService.updateStaff(id, dto);
  }

  @Delete(':id')
  async deleteStaff(@Param('id') id: string) {
    return this.staffService.deleteStaff(id);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Param('id') id: string,
    @CurrentUser('userId') adminId: string,
    @Body() dto?: ResetPasswordDto,
  ) {
    return this.staffService.resetPassword(id, dto, adminId);
  }
}
