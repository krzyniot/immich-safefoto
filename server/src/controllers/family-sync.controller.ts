import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { AuthDto } from 'src/dtos/auth.dto';
import { FamilySyncManifestDto } from 'src/dtos/family-sync.dto';
import { ApiTag, Permission } from 'src/enum';
import { Auth, Authenticated } from 'src/middleware/auth.guard';
import { FamilySyncService } from 'src/services/family-sync.service';

@ApiTags(ApiTag.Assets)
@Controller('family/sync')
export class FamilySyncController {
  constructor(private service: FamilySyncService) {}

  @Get('manifest')
  @Authenticated({ permission: Permission.AssetRead })
  @Endpoint({
    summary: 'Get an atomic, complete manifest of currently shared family photos and albums',
    description:
      'For full client reconciliation. Missing shared IDs may be evicted from the shared cache, NEVER from the phone gallery or private originals. Failed requests must not cause any eviction. This is not a change-event stream.',
    history: new HistoryBuilder().added('v3'),
  })
  getManifest(@Auth() auth: AuthDto): Promise<FamilySyncManifestDto> {
    return this.service.getManifest(auth);
  }
}
