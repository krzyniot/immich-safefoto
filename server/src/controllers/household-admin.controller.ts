import { Body, Controller, HttpCode, HttpStatus, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { HouseholdIdParamDto, HouseholdStoragePoolDto } from 'src/dtos/household.dto';
import { ApiTag, Permission } from 'src/enum';
import { Authenticated } from 'src/middleware/auth.guard';
import { UserAdminService } from 'src/services/user-admin.service';

@ApiTags(ApiTag.UsersAdmin)
@Controller('admin/households')
export class HouseholdAdminController {
  constructor(private service: UserAdminService) {}

  @Put(':id/storage-pool')
  @Authenticated({ permission: Permission.AdminUserUpdate, admin: true })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Endpoint({ summary: 'Set SafeFoto household storage pool',
    history: new HistoryBuilder().added('v3').beta('v3') })
  setHouseholdStoragePool(@Param() { id }: HouseholdIdParamDto, @Body() dto: HouseholdStoragePoolDto): Promise<void> {
    return this.service.setHouseholdStoragePool(id, dto);
  }
}
