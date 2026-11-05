<script lang="ts">
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import {
    fetchFamilyAlbumPhotos,
    fetchFamilyAlbums,
    type FamilyAlbum,
  } from '$lib/services/safefoto-family-album.service';
  import { groupFamilyPhotosByMonth } from '$lib/services/safefoto-family-photo-groups';
  import {
    FamilyPhotoFetchError,
    fetchFamilyPhotoPage,
    type FamilyPhoto,
  } from '$lib/services/safefoto-family-photo.service';
  import { getAssetMediaUrl } from '$lib/utils';
  import { AssetMediaSize } from '@immich/sdk';
  import { onMount } from 'svelte';

  let photos = $state<FamilyPhoto[]>([]);
  let albums = $state<FamilyAlbum[]>([]);
  let selectedAlbumId = $state('');
  let nextPage = $state<number | null>(1);
  let loading = $state(false);
  let loadingAlbums = $state(false);
  let error = $state('');
  let selectedPhoto = $state<FamilyPhoto | null>(null);
  let mediaCacheKey = $state('');
  let mediaCacheSequence = 0;
  let loadMoreSentinel = $state<HTMLDivElement | undefined>();
  let supportsIntersectionObserver = $state(true);

  const activeUserId = $derived(authManager.authenticated ? authManager.user.id : null);
  const months = $derived(groupFamilyPhotosByMonth(photos));
  const years = $derived([...new Set(months.map((month) => month.year))]);
  const selectedPhotoId = $derived(selectedPhoto?.id);
  const selectedPhotoIndex = $derived(selectedPhotoId ? photos.findIndex((photo) => photo.id === selectedPhotoId) : -1);

  const navigatePreview = (direction: -1 | 1) => {
    const target = selectedPhotoIndex + direction;
    if (target >= 0 && target < photos.length) {
      selectedPhoto = photos[target];
    }
  };

  const onPreviewKeydown = (event: KeyboardEvent) => {
    if (!selectedPhoto) {
      return;
    }
    switch (event.key) {
      case 'Escape': {
        selectedPhoto = null;
        break;
      }
      case 'ArrowRight': {
        event.preventDefault();
        navigatePreview(1);
        break;
      }
      case 'ArrowLeft': {
        event.preventDefault();
        navigatePreview(-1);
        break;
      }
    }
  };
  let loadedFor: string | null = null;
  let requestGeneration = 0;

  const clearPhotos = () => {
    photos = [];
    nextPage = 1;
    selectedPhoto = null;
    loading = false;
    error = '';
  };

  const accessFailure = (cause: unknown) => {
    if (cause instanceof FamilyPhotoFetchError && [401, 403, 404].includes(cause.status)) {
      // Do not retain photo thumbnails after an access error or revoked membership.
      requestGeneration++;
      loadingAlbums = false;
      albums = [];
      selectedAlbumId = '';
      clearPhotos();
      nextPage = null;
      error = 'Nie masz obecnie dostępu do zdjęć tej rodziny. Sprawdź swoje członkostwo lub zaloguj się ponownie.';
    } else {
      error = 'Nie udało się pobrać danych rodziny. Spróbuj ponownie.';
    }
  };

  const loadMore = async () => {
    const userId = activeUserId;
    const page = nextPage;
    const albumId = selectedAlbumId;
    if (!userId || page === null || loading || loadingAlbums || error) {
      return;
    }

    loading = true;
    const generation = ++requestGeneration;
    try {
      const result = albumId ? await fetchFamilyAlbumPhotos(albumId, page) : await fetchFamilyPhotoPage(page);
      if (activeUserId !== userId || generation !== requestGeneration) {
        return;
      }
      const existing = new Set(photos.map((photo) => photo.id));
      photos = [...photos, ...result.items.filter((photo) => !existing.has(photo.id))];
      nextPage = result.nextPage;
    } catch (error_) {
      if (activeUserId === userId && generation === requestGeneration) {
        accessFailure(error_);
      }
    } finally {
      if (activeUserId === userId && generation === requestGeneration) {
        loading = false;
      }
    }
  };

  const refresh = async () => {
    const userId = activeUserId;
    ++requestGeneration;
    // Revalidate thumbnails after each family membership check. Do not reuse
    // yesterday's cached media response when access has changed.
    mediaCacheKey = `${Date.now()}-${++mediaCacheSequence}`;
    clearPhotos();
    albums = [];
    if (!userId) {
      selectedAlbumId = '';
      return;
    }

    loadingAlbums = true;
    const generation = requestGeneration;
    try {
      const currentAlbums = await fetchFamilyAlbums();
      if (activeUserId !== userId || generation !== requestGeneration) {
        return;
      }
      albums = currentAlbums;
      if (selectedAlbumId && !currentAlbums.some((album) => album.id === selectedAlbumId)) {
        selectedAlbumId = '';
      }
    } catch (error_) {
      if (activeUserId === userId && generation === requestGeneration) {
        accessFailure(error_);
      }
      return;
    } finally {
      if (generation === requestGeneration) {
        loadingAlbums = false;
      }
    }
    if (activeUserId === userId && generation === requestGeneration) {
      await loadMore();
    }
  };

  const selectAlbum = (id: string) => {
    if (id && !albums.some((album) => album.id === id)) {
      return;
    }
    ++requestGeneration;
    selectedAlbumId = id;
    clearPhotos();
    void loadMore();
  };

  // Recheck membership on return to the application. In-flight responses are
  // discarded by requestGeneration; cached photos are removed before revalidation.
  const recheckOnFocus = () => {
    if (activeUserId) {
      void refresh();
    }
  };

  onMount(() => {
    supportsIntersectionObserver = typeof IntersectionObserver !== 'undefined';
  });

  $effect(() => {
    if (
      !supportsIntersectionObserver ||
      !activeUserId ||
      !loadMoreSentinel ||
      loading ||
      loadingAlbums ||
      error ||
      nextPage === null ||
      selectedPhoto
    ) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          void loadMore();
        }
      },
      { rootMargin: '300px 0px' },
    );
    observer.observe(loadMoreSentinel);
    return () => observer.disconnect();
  });

  $effect(() => {
    const current = activeUserId;
    if (loadedFor !== current) {
      loadedFor = current;
      ++requestGeneration;
      clearPhotos();
      albums = [];
      selectedAlbumId = '';
      if (current) {
        void refresh();
      }
    }
  });
</script>

<svelte:window onfocus={recheckOnFocus} onkeydown={onPreviewKeydown} />

<UserPageLayout title="Zdjęcia rodziny">
  <div class="mx-auto max-w-7xl px-2 pb-12">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <button
        type="button"
        onclick={() => void refresh()}
        disabled={loading || loadingAlbums || !activeUserId}
        class="rounded-lg border px-4 py-2 text-sm hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800"
      >
        Odśwież
      </button>
    </div>

    <div class="mb-5 flex flex-wrap items-center gap-3">
      <label for="family-album-filter" class="text-sm">Pokaż zdjęcia:</label>
      <select
        id="family-album-filter"
        class="max-w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
        value={selectedAlbumId}
        disabled={loadingAlbums || !activeUserId}
        onchange={(event) => selectAlbum(event.currentTarget.value)}
      >
        <option value="">Wszystkie zdjęcia rodziny</option>
        {#each albums as album (album.id)}
          <option value={album.id}>{album.albumName}</option>
        {/each}
      </select>
      <span class="text-sm text-gray-500">{albums.length} albumów rodzinnych</span>
    </div>

    {#if error}
      <p class="mb-4 rounded-lg border border-red-300 p-4 text-sm text-red-600" role="alert">{error}</p>
    {/if}

    {#if !activeUserId}
      <p role="status">Zaloguj się, aby zobaczyć zdjęcia swojej rodziny.</p>
    {:else if !loading && !loadingAlbums && photos.length === 0 && !error}
      <p role="status" class="py-12 text-center text-gray-500">
        Brak zdjęć w wybranym widoku. Zdjęcia pojawią się tu po ich świadomym udostępnieniu.
      </p>
    {/if}

    {#if years.length > 1}
      <nav aria-label="Przejdź do roku" class="mb-5 flex flex-wrap gap-3">
        {#each years as year (year)}
          <a
            class="rounded-lg border px-3 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
            href={'#family-year-' + year}>{year}</a
          >
        {/each}
      </nav>
    {/if}

    {#each months as month, index (month.key)}
      <section
        aria-label={month.title}
        class="mb-8"
        id={index === 0 || months[index - 1].year !== month.year ? 'family-year-' + month.year : undefined}
      >
        <h2
          class="sticky top-0 z-10 mb-3 border-b border-gray-200 bg-white/95 py-2 text-lg capitalize backdrop-blur-sm dark:border-gray-800 dark:bg-black/95"
        >
          {month.title}
        </h2>
        <div class="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8">
          {#each month.photos as photo (photo.id)}
            <button
              type="button"
              class="group aspect-square overflow-hidden rounded-sm bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 dark:bg-gray-800"
              aria-label={'Pokaż zdjęcie z ' + new Date(photo.localDateTime).toLocaleDateString('pl-PL')}
              onclick={() => (selectedPhoto = photo)}
            >
              <img
                src={getAssetMediaUrl({ id: photo.id, size: AssetMediaSize.Thumbnail, cacheKey: mediaCacheKey })}
                alt="Zdjęcie rodzinne"
                loading="lazy"
                class="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none"
              />
            </button>
          {/each}
        </div>
      </section>
    {/each}

    <div bind:this={loadMoreSentinel} data-family-load-sentinel aria-hidden="true" class="h-px"></div>
    {#if loading || loadingAlbums}
      <p class="py-6 text-center text-sm text-gray-500" role="status">Wczytywanie zdjęć rodziny…</p>
    {:else if nextPage !== null && activeUserId && !error && !supportsIntersectionObserver}
      <div class="flex justify-center">
        <button
          type="button"
          onclick={() => void loadMore()}
          class="rounded-lg border px-5 py-2 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          Pokaż starsze zdjęcia
        </button>
      </div>
    {/if}
  </div>
</UserPageLayout>

{#if selectedPhoto && activeUserId}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/95 px-2 py-14 sm:px-14"
    role="presentation"
    onclick={(event) => {
      if (event.target === event.currentTarget) {
        selectedPhoto = null;
      }
    }}
  >
    <div class="absolute top-3 right-4 flex items-center gap-4 text-white">
      <span class="text-sm tabular-nums" aria-live="polite">
        {selectedPhotoIndex + 1} / {photos.length}
      </span>
      <button
        type="button"
        aria-label="Zamknij podgląd zdjęcia"
        class="rounded-full bg-white/10 px-3 py-2 text-xl hover:bg-white/20"
        onclick={() => (selectedPhoto = null)}>×</button
      >
    </div>
    <button
      type="button"
      aria-label="Poprzednie zdjęcie rodzinne"
      disabled={selectedPhotoIndex <= 0}
      onclick={() => navigatePreview(-1)}
      class="absolute left-2 z-10 rounded-full bg-black/40 p-3 text-2xl text-white hover:bg-white/15 disabled:invisible sm:left-4"
      >‹</button
    >
    <img
      src={getAssetMediaUrl({ id: selectedPhoto.id, size: AssetMediaSize.Preview, cacheKey: mediaCacheKey })}
      alt="Podgląd zdjęcia rodzinnego"
      class="max-h-full max-w-full object-contain"
    />
    <button
      type="button"
      aria-label="Następne zdjęcie rodzinne"
      disabled={selectedPhotoIndex < 0 || selectedPhotoIndex >= photos.length - 1}
      onclick={() => navigatePreview(1)}
      class="absolute right-2 z-10 rounded-full bg-black/40 p-3 text-2xl text-white hover:bg-white/15 disabled:invisible sm:right-4"
      >›</button
    >
  </div>
{/if}
