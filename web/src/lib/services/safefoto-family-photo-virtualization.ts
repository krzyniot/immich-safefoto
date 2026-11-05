import type { FamilyPhotoMonth } from '$lib/services/safefoto-family-photo-groups';
import type { FamilyPhoto } from '$lib/services/safefoto-family-photo.service';

export type FamilyVirtualRow =
  | { kind: 'month'; key: string; title: string; year: number; offset: number; height: number }
  | { kind: 'photos'; key: string; photos: FamilyPhoto[]; offset: number; height: number }
  | { kind: 'spacing'; key: string; offset: number; height: number };

export type FamilyVirtualLayout = {
  rows: FamilyVirtualRow[];
  totalHeight: number;
  columns: number;
};

export const getFamilyGridColumns = (viewportWidth: number) =>
  viewportWidth >= 1280 ? 8 : viewportWidth >= 1024 ? 7 : viewportWidth >= 768 ? 6 : viewportWidth >= 640 ? 4 : 3;

export const buildFamilyVirtualLayout = (
  months: FamilyPhotoMonth[],
  galleryWidth: number,
  viewportWidth: number,
): FamilyVirtualLayout => {
  const columns = getFamilyGridColumns(viewportWidth);
  const rowHeight = Math.max(8, (Math.max(0, galleryWidth) - (columns - 1) * 4) / columns + 4);
  const rows: FamilyVirtualRow[] = [];
  let offset = 0;
  for (const month of months) {
    rows.push({ kind: 'month', key: month.key, title: month.title, year: month.year, offset, height: 52 });
    offset += 52;
    for (let start = 0; start < month.photos.length; start += columns) {
      rows.push({
        kind: 'photos',
        key: month.key + '-' + start,
        photos: month.photos.slice(start, start + columns),
        offset,
        height: rowHeight,
      });
      offset += rowHeight;
    }
    rows.push({ kind: 'spacing', key: month.key + '-spacing', offset, height: 24 });
    offset += 24;
  }
  return { rows, columns, totalHeight: offset };
};

const firstRowAfter = (rows: FamilyVirtualRow[], offset: number) => {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (rows[mid].offset + rows[mid].height <= offset) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
};

export const getFamilyVirtualWindow = (
  layout: FamilyVirtualLayout,
  relativeScrollTop: number,
  viewportHeight: number,
  overscan = 1000,
) => {
  const startIndex = firstRowAfter(layout.rows, Math.max(0, relativeScrollTop - overscan));
  const endIndex = firstRowAfter(layout.rows, relativeScrollTop + Math.max(0, viewportHeight) + overscan);
  const rendered = layout.rows.slice(startIndex, endIndex);
  const top = rendered[0]?.offset ?? layout.totalHeight;
  const bottom = Math.max(
    0,
    layout.totalHeight - ((rendered.at(-1)?.offset ?? layout.totalHeight) + (rendered.at(-1)?.height ?? 0)),
  );
  return { rows: rendered, top, bottom, startIndex, endIndex };
};
