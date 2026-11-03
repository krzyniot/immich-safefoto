/**
 * SafeFoto family photo metadata, read-only.
 *
 * Additive web-only client: existing Immich endpoints, login cookies, and mobile
 * synchronization are unchanged. No photo publication or deletion occurs here.
 */
export type FamilyPhoto = {
  id: string;
  ownerId: string;
  type: string;
  fileCreatedAt: string;
  localDateTime: string;
  hideFromPersonalTimeline: boolean;
  publishedAt: string;
  updatedAt: string;
};

export type FamilyPhotoPage = {
  items: FamilyPhoto[];
  page: number;
  limit: number;
  nextPage: number | null;
};

export class FamilyPhotoFetchError extends Error {
  constructor(public readonly status: number) {
    super(`Family photo request failed (${status})`);
    this.name = 'FamilyPhotoFetchError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFamilyPhoto = (value: unknown): value is FamilyPhoto =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.ownerId === 'string' &&
  typeof value.type === 'string' &&
  typeof value.fileCreatedAt === 'string' &&
  typeof value.localDateTime === 'string' &&
  typeof value.hideFromPersonalTimeline === 'boolean' &&
  typeof value.publishedAt === 'string' &&
  typeof value.updatedAt === 'string';

export const parseFamilyPhotoPage = (value: unknown): FamilyPhotoPage => {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    !value.items.every(isFamilyPhoto) ||
    !Number.isInteger(value.page) ||
    (value.page as number) < 1 ||
    !Number.isInteger(value.limit) ||
    (value.limit as number) < 1 ||
    (value.limit as number) > 100 ||
    (value.nextPage !== null && (!Number.isInteger(value.nextPage) || (value.nextPage as number) <= (value.page as number)))
  ) {
    throw new Error('Invalid family photo page response');
  }
  return value as FamilyPhotoPage;
};

/** The server checks current family membership for every request. */
export const fetchFamilyPhotoPage = async (
  page = 1,
  limit = 50,
  request: typeof fetch = fetch,
): Promise<FamilyPhotoPage> => {
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError('Invalid family photo pagination');
  }

  const response = await request(`/api/family/photos?page=${page}&limit=${limit}`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });

  // Never interpret an expired session or temporary outage as an empty family.
  if (!response.ok) {
    throw new FamilyPhotoFetchError(response.status);
  }
  return parseFamilyPhotoPage(await response.json());
};
