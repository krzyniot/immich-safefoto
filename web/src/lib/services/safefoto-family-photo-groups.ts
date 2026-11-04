import type { FamilyPhoto } from '$lib/services/safefoto-family-photo.service';

export type FamilyPhotoMonth = {
  key: string;
  title: string;
  year: number;
  photos: FamilyPhoto[];
};

export const groupFamilyPhotosByMonth = (photos: FamilyPhoto[]): FamilyPhotoMonth[] => {
  const groups = new Map<string, FamilyPhotoMonth>();

  for (const photo of [...photos].sort(
    (a, b) => b.localDateTime.localeCompare(a.localDateTime) || b.id.localeCompare(a.id),
  )) {
    const date = new Date(photo.localDateTime);
    if (Number.isNaN(date.getTime())) {
      continue;
    }
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        title: new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date),
        year,
        photos: [],
      };
      groups.set(key, group);
    }
    group.photos.push(photo);
  }

  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key));
};
