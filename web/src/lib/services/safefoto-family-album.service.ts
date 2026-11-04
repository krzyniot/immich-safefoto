import { FamilyPhotoFetchError, parseFamilyPhotoPage, type FamilyPhotoPage } from '$lib/services/safefoto-family-photo.service';

export type FamilyAlbum = {
  id: string;
  albumName: string;
  description: string;
  defaultMode: 'share' | 'move';
  publishedAt: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseFamilyAlbums = (value: unknown): FamilyAlbum[] => {
  if (
    !Array.isArray(value) ||
    !value.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === 'string' &&
        typeof item.albumName === 'string' &&
        typeof item.description === 'string' &&
        (item.defaultMode === 'share' || item.defaultMode === 'move') &&
        typeof item.publishedAt === 'string',
    )
  ) {
    throw new Error('Invalid family album list response');
  }
  return value as FamilyAlbum[];
};

const requireSuccess = async (response: Response): Promise<unknown> => {
  if (!response.ok) {
    throw new FamilyPhotoFetchError(response.status);
  }
  return response.json();
};

export const fetchFamilyAlbums = async (request: typeof fetch = fetch): Promise<FamilyAlbum[]> => {
  const response = await request('/api/family/albums', {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  return parseFamilyAlbums(await requireSuccess(response));
};

const UUID_V4 = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

export const fetchFamilyAlbumPhotos = async (
  albumId: string,
  page = 1,
  limit = 50,
  request: typeof fetch = fetch,
): Promise<FamilyPhotoPage> => {
  if (!UUID_V4.test(albumId) || !Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError('Invalid family album photo request');
  }
  const response = await request(`/api/family/albums/${albumId}/photos?page=${page}&limit=${limit}`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  return parseFamilyPhotoPage(await requireSuccess(response));
};
