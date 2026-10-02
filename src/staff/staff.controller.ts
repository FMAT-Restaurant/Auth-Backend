import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffRolesDto } from './dto/update-staff-roles.dto';
import { UpdateStaffStatusDto } from './dto/update-staff-status.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RoleEnum } from '../database/entities/role.entity';

@Controller('api/v1/staff')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMINISTRADOR)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post()
  async createStaff(@Body() dto: CreateStaffDto) {
    return this.staffService.createStaff(dto);
  }

  @Get()
  async findAllStaff(
    @Query('role') role?: string,
    @Query('isActive') isActive?: string,
  ) {
    const activeBool =
      isActive === undefined ? undefined : isActive === 'true';
    return this.staffService.findAllStaff(role, activeBool);
  }

  @Get(':id')
  async findStaffById(@Param('id') id: string) {
    return this.staffService.findStaffById(id);
  }

  @Put(':id/roles')
  async updateRoles(
    @Param('id') id: string,
    @Body() dto: UpdateStaffRolesDto,
  ) {
    return this.staffService.updateRoles(id, dto);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStaffStatusDto,
  ) {
    return this.staffService.updateStatus(id, dto);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.staffService.resetPassword(id, dto);
  }
}
