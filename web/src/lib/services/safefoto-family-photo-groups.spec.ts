import { groupFamilyPhotosByMonth } from '$lib/services/safefoto-family-photo-groups';
import type { FamilyPhoto } from '$lib/services/safefoto-family-photo.service';

const photo = (id: string, date: string): FamilyPhoto => ({
  id,
  ownerId: '82e397fd-dc8c-49e3-8e63-e6f356b2b0bf',
  type: 'IMAGE',
  fileCreatedAt: date,
  localDateTime: date,
  hideFromPersonalTimeline: false,
  publishedAt: date,
  updatedAt: date,
});

describe('SafeFoto family photo timeline grouping', () => {
  it('groups photos into descending months without modifying source data', () => {
    const photos = [
      photo('old', '2025-12-01T12:00:00.000Z'),
      photo('middle', '2026-01-04T12:00:00.000Z'),
      photo('new', '2026-01-10T12:00:00.000Z'),
    ];
    const result = groupFamilyPhotosByMonth(photos);
    expect(result.map((group) => group.key)).toEqual(['2026-01', '2025-12']);
    expect(result[0].photos.map((asset) => asset.id)).toEqual(['new', 'middle']);
    expect(photos[0].id).toBe('old');
  });

  it('orders months and photos by displayed local date even if file timestamps differ', () => {
    const january = photo('jan', '2026-01-10T00:00:00.000Z');
    january.fileCreatedAt = '2025-12-01T00:00:00.000Z';
    const december = photo('dec', '2025-12-20T00:00:00.000Z');
    december.fileCreatedAt = '2026-02-01T00:00:00.000Z';
    const januaryOlder = photo('jan-old', '2026-01-01T00:00:00.000Z');
    januaryOlder.fileCreatedAt = '2026-04-01T00:00:00.000Z';
    const groups = groupFamilyPhotosByMonth([december, januaryOlder, january]);
    expect(groups.map((group) => group.key)).toEqual(['2026-01', '2025-12']);
    expect(groups[0].photos.map((item) => item.id)).toEqual(['jan', 'jan-old']);
  });

  it('handles invalid dates without inserting a false month', () => {
    const result = groupFamilyPhotosByMonth([photo('broken', 'not-a-date')]);
    expect(result).toEqual([]);
  });

  it('uses the localDateTime for the month label', () => {
    const item = photo('asset', '2026-01-01T00:30:00.000Z');
    item.localDateTime = '2025-12-31T23:30:00.000Z';
    expect(groupFamilyPhotosByMonth([item])[0].key).toBe('2025-12');
  });
});
