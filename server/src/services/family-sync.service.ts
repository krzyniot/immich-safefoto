import { Injectable } from '@nestjs/common';
import { AuthDto } from 'src/dtos/auth.dto';
import { FamilySyncRepository } from 'src/repositories/family-sync.repository';

@Injectable()
export class FamilySyncService {
  constructor(private repository: FamilySyncRepository) {}

  getManifest(auth: AuthDto) {
    return this.repository.getManifest(auth.user.id);
  }
}
