import {
  FamilyPhotoFetchError,
  fetchFamilyPhotoPage,
  parseFamilyPhotoPage,
} from '$lib/services/safefoto-family-photo.service';

const sample = {
  id: '38f8e26d-10b3-4fbb-a358-d6336ee1b317',
  ownerId: '5c6fc02f-9242-41fd-90f9-5a73528d7ad9',
  type: 'IMAGE',
  fileCreatedAt: '2026-09-27T12:00:00.000Z',
  localDateTime: '2026-09-27T12:00:00.000Z',
  hideFromPersonalTimeline: false,
  publishedAt: '2026-09-28T12:00:00.000Z',
  updatedAt: '2026-09-28T12:00:00.000Z',
};

const page = { items: [sample], page: 1, limit: 50, nextPage: null };

describe('SafeFoto family photo read-only API client', () => {
  it('accepts a valid page of explicitly published family photos', () => {
    expect(parseFamilyPhotoPage(page)).toEqual(page);
  });

  it('rejects malformed and incomplete responses rather than displaying other data', () => {
    expect(() => parseFamilyPhotoPage({ ...page, items: [{ ...sample, ownerId: undefined }] })).toThrow();
    expect(() => parseFamilyPhotoPage({ ...page, nextPage: 1 })).toThrow();
    expect(() => parseFamilyPhotoPage({ ...page, limit: 150 })).toThrow();
  });

  it('uses existing same-origin session and the additive family endpoint', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      { ok: true, status: 200, json: () => Promise.resolve(page) } as Response,
    );
    await expect(fetchFamilyPhotoPage(1, 50, request)).resolves.toEqual(page);
    expect(request).toHaveBeenCalledWith('/api/family/photos?page=1&limit=50', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
  });

  it.each([401, 403, 500, 503])('does not treat HTTP %s as an empty family', async (status) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue({ ok: false, status } as Response);
    await expect(fetchFamilyPhotoPage(1, 50, request)).rejects.toBeInstanceOf(FamilyPhotoFetchError);
  });

  it('rejects invalid page/limit without issuing any request', async () => {
    const request = vi.fn<typeof fetch>();
    await expect(fetchFamilyPhotoPage(0, 50, request)).rejects.toThrow(RangeError);
    await expect(fetchFamilyPhotoPage(1, 101, request)).rejects.toThrow(RangeError);
    expect(request).not.toHaveBeenCalled();
  });
});
