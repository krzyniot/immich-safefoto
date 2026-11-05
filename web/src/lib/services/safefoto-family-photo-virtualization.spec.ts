import type { FamilyPhotoMonth } from '$lib/services/safefoto-family-photo-groups';
import {
  buildFamilyVirtualLayout,
  getFamilyGridColumns,
  getFamilyVirtualWindow,
} from '$lib/services/safefoto-family-photo-virtualization';
import type { FamilyPhoto } from '$lib/services/safefoto-family-photo.service';

const photo = (n: number): FamilyPhoto => ({
  id: `photo-${n}`,
  ownerId: 'owner',
  type: 'IMAGE',
  fileCreatedAt: '2026-11-01T00:00:00Z',
  localDateTime: '2026-11-01T00:00:00Z',
  hideFromPersonalTimeline: false,
  publishedAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
});

describe('SafeFoto Stage32 family photo row virtualization', () => {
  it('matches the responsive 3/4/6/7/8-column grid', () => {
    expect([390, 640, 768, 1024, 1280].map((width) => getFamilyGridColumns(width))).toEqual([3, 4, 6, 7, 8]);
  });

  it('preserves all photos and month order in the full layout', () => {
    const months: FamilyPhotoMonth[] = [
      { key: '2026-11', title: 'listopad 2026', year: 2026, photos: Array.from({ length: 101 }, (_, n) => photo(n)) },
      { key: '2026-10', title: 'październik 2026', year: 2026, photos: [photo(101)] },
    ];
    const layout = buildFamilyVirtualLayout(months, 1200, 1440);
    expect(layout.columns).toBe(8);
    expect(layout.rows.filter((row) => row.kind === 'month').map((row) => row.key)).toEqual(['2026-11', '2026-10']);
    expect(layout.rows.flatMap((row) => (row.kind === 'photos' ? row.photos : [])).map((item) => item.id)).toEqual(
      Array.from({ length: 102 }, (_, n) => `photo-${n}`),
    );
    expect(layout.totalHeight).toBeGreaterThan(0);
  });

  it('renders only near-viewport rows for ten thousand photos and preserves precise spacer height', () => {
    const month: FamilyPhotoMonth = {
      key: '2026-11',
      title: 'listopad 2026',
      year: 2026,
      photos: Array.from({ length: 10_000 }, (_, n) => photo(n)),
    };
    const layout = buildFamilyVirtualLayout([month], 1170, 1440);
    for (const scroll of [0, 1000, 10_000, Math.floor(layout.totalHeight / 2), layout.totalHeight - 850]) {
      const visible = getFamilyVirtualWindow(layout, scroll, 850, 900);
      expect(visible.rows.length).toBeLessThan(45);
      expect(visible.top + visible.rows.reduce((sum, row) => sum + row.height, 0) + visible.bottom).toBeCloseTo(
        layout.totalHeight,
        5,
      );
    }
  });

  it('handles empty galleries and scroll position past the end', () => {
    const layout = buildFamilyVirtualLayout([], 1000, 390);
    expect(getFamilyVirtualWindow(layout, 0, 800).rows).toEqual([]);
    expect(getFamilyVirtualWindow(layout, 0, 800).top).toBe(0);
  });
});
