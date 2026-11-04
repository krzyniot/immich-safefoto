import {
  fetchFamilyAlbumPhotos,
  fetchFamilyAlbums,
  parseFamilyAlbums,
} from '$lib/services/safefoto-family-album.service';
import { FamilyPhotoFetchError } from '$lib/services/safefoto-family-photo.service';

const albumId = 'a34a957c-6f17-43c3-8356-3c81f0ef8ad9';
const albums = [{ id: albumId, albumName: 'Wakacje', description: '', defaultMode: 'share', publishedAt: '2026-09-22T12:00:00.000Z' }];
const page = { items: [], page: 1, limit: 50, nextPage: null };

describe('SafeFoto family album read-only API', () => {
  it('accepts a valid album list and rejects unknown publication modes', () => {
    expect(parseFamilyAlbums(albums)).toEqual(albums);
    expect(() => parseFamilyAlbums([{ ...albums[0], defaultMode: 'private' }])).toThrow();
    expect(() => parseFamilyAlbums({ albums })).toThrow();
  });

  it('fetches family albums with the existing session', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(albums),
    } as Response);
    await expect(fetchFamilyAlbums(request)).resolves.toEqual(albums);
    expect(request).toHaveBeenCalledWith('/api/family/albums', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
  });

  it('fetches only assets in the explicitly selected family album', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(page),
    } as Response);
    await expect(fetchFamilyAlbumPhotos(albumId, 1, 50, request)).resolves.toEqual(page);
    expect(request).toHaveBeenCalledWith(`/api/family/albums/${albumId}/photos?page=1&limit=50`, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
  });

  it('rejects invalid identifiers and page sizes before making network calls', async () => {
    const request = vi.fn<typeof fetch>();
    await expect(fetchFamilyAlbumPhotos('../private', 1, 50, request)).rejects.toThrow(RangeError);
    await expect(fetchFamilyAlbumPhotos(albumId, 0, 50, request)).rejects.toThrow(RangeError);
    await expect(fetchFamilyAlbumPhotos(albumId, 1, 101, request)).rejects.toThrow(RangeError);
    expect(request).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 503])('does not turn HTTP %s into a harmless empty album', async (status) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue({ ok: false, status } as Response);
    await expect(fetchFamilyAlbums(request)).rejects.toBeInstanceOf(FamilyPhotoFetchError);
    await expect(fetchFamilyAlbumPhotos(albumId, 1, 50, request)).rejects.toBeInstanceOf(FamilyPhotoFetchError);
  });
});
