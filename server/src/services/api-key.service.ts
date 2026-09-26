import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ApiKey } from 'src/database';
import { ApiKeyCreateDto, ApiKeyCreateResponseDto, ApiKeyResponseDto, ApiKeyUpdateDto } from 'src/dtos/api-key.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { Permission } from 'src/enum';
import { BaseService } from 'src/services/base.service';
import { isGranted } from 'src/utils/access';

const isSafeFotoPanelKey = (name: string, permissions: Permission[]) => {
  const normalizedName = name.trim().toLocaleLowerCase();
  const requiredPermissions = [Permission.AdminUserRead, Permission.AdminUserCreate, Permission.AdminUserUpdate];
  return (
    normalizedName.startsWith('safefoto') &&
    normalizedName.includes('panel') &&
    requiredPermissions.every((permission) => permissions.includes(permission))
  );
};

@Injectable()
export class ApiKeyService extends BaseService {
  async create(auth: AuthDto, dto: ApiKeyCreateDto): Promise<ApiKeyCreateResponseDto> {
    const token = this.cryptoRepository.randomBytesAsText(32);
    const hashed = this.cryptoRepository.hashSha256(token);

    if (auth.apiKey && !isGranted({ requested: dto.permissions, current: auth.apiKey.permissions })) {
      throw new BadRequestException('Cannot grant permissions you do not have');
    }

    const name = dto.name || 'API Key';
    const entity = await this.apiKeyRepository.create({
      key: hashed,
      name,
      userId: auth.user.id,
      permissions: dto.permissions,
      ...(isSafeFotoPanelKey(name, dto.permissions) ? { isSystemManaged: true } : {}),
    });

    return { secret: token, apiKey: this.map(entity) };
  }

  async update(auth: AuthDto, id: string, dto: ApiKeyUpdateDto): Promise<ApiKeyResponseDto> {
    const exists = await this.apiKeyRepository.getById(auth.user.id, id);
    if (!exists) {
      throw new BadRequestException('API Key not found');
    }

    if (exists.isSystemManaged) {
      throw new ForbiddenException('System-managed API key cannot be changed');
    }

    if (
      auth.apiKey &&
      dto.permissions &&
      !isGranted({ requested: dto.permissions, current: auth.apiKey.permissions })
    ) {
      throw new BadRequestException('Cannot grant permissions you do not have');
    }

    const name = dto.name ?? exists.name;
    const permissions = dto.permissions ?? (exists.permissions as Permission[]);
    const key = await this.apiKeyRepository.update(auth.user.id, id, {
      name: dto.name,
      permissions: dto.permissions,
      ...(isSafeFotoPanelKey(name, permissions) ? { isSystemManaged: true } : {}),
    });

    return this.map(key);
  }

  async delete(auth: AuthDto, id: string): Promise<void> {
    const exists = await this.apiKeyRepository.getById(auth.user.id, id);
    if (!exists) {
      throw new BadRequestException('API Key not found');
    }

    if (exists.isSystemManaged) {
      throw new ForbiddenException('System-managed API key cannot be deleted');
    }

    await this.apiKeyRepository.delete(auth.user.id, id);
  }

  async getMine(auth: AuthDto): Promise<ApiKeyResponseDto> {
    if (!auth.apiKey) {
      throw new ForbiddenException('Not authenticated with an API Key');
    }

    const key = await this.apiKeyRepository.getById(auth.user.id, auth.apiKey.id);
    if (!key) {
      throw new BadRequestException('API Key not found');
    }

    return this.map(key);
  }

  async getById(auth: AuthDto, id: string): Promise<ApiKeyResponseDto> {
    const key = await this.apiKeyRepository.getById(auth.user.id, id);
    if (!key) {
      throw new BadRequestException('API Key not found');
    }
    return this.map(key);
  }

  async getAll(auth: AuthDto): Promise<ApiKeyResponseDto[]> {
    const keys = await this.apiKeyRepository.getByUserId(auth.user.id);
    return keys.map((key) => this.map(key));
  }

  private map(entity: ApiKey): ApiKeyResponseDto {
    return {
      id: entity.id,
      name: entity.name,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      permissions: entity.permissions as Permission[],
    };
  }
}
