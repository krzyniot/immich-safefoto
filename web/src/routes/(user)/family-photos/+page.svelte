<script lang="ts">
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { groupFamilyPhotosByMonth } from '$lib/services/safefoto-family-photo-groups';
  import {
    FamilyPhotoFetchError,
    fetchFamilyPhotoPage,
    type FamilyPhoto,
  } from '$lib/services/safefoto-family-photo.service';
  import { getAssetMediaUrl } from '$lib/utils';
  import { AssetMediaSize } from '@immich/sdk';

  let photos = $state<FamilyPhoto[]>([]);
  let nextPage = $state<number | null>(1);
  let loading = $state(false);
  let error = $state('');
  let selectedPhoto = $state<FamilyPhoto | null>(null);
  const activeUserId = $derived(authManager.authenticated ? authManager.user.id : null);
  const months = $derived(groupFamilyPhotosByMonth(photos));
  let loadedFor: string | null = null;

  const clear = () => {
    photos = [];
    nextPage = 1;
    selectedPhoto = null;
    error = '';
    loading = false;
  };

  const loadMore = async () => {
    const userId = activeUserId;
    const page = nextPage;
    if (!userId || page === null || loading) {
      return;
    }

    loading = true;
    error = '';
    try {
      const result = await fetchFamilyPhotoPage(page);
      // A result from a previous login must never be displayed to a new user.
      if (activeUserId !== userId) {
        return;
      }
      const seen = new Set(photos.map((photo) => photo.id));
      photos = [...photos, ...result.items.filter((photo) => !seen.has(photo.id))];
      nextPage = result.nextPage;
    } catch (error_) {
      if (activeUserId !== userId) {
        return;
      }
      if (error_ instanceof FamilyPhotoFetchError && (error_.status === 401 || error_.status === 403)) {
        clear();
        nextPage = null;
        error = 'Nie masz obecnie dostępu do zdjęć tej rodziny. Zaloguj się ponownie lub sprawdź członkostwo.';
      } else {
        error = 'Nie udało się pobrać zdjęć rodziny. Spróbuj ponownie.';
      }
    } finally {
      if (activeUserId === userId) {
        loading = false;
      }
    }
  };

  const refresh = () => {
    clear();
    void loadMore();
  };

  $effect(() => {
    const current = activeUserId;
    if (loadedFor !== current) {
      loadedFor = current;
      clear();
      if (current) {
        void loadMore();
      }
    }
  });
</script>

<UserPageLayout title="Zdjęcia rodziny">
  <div class="mx-auto max-w-7xl px-2 pb-12">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <p class="max-w-2xl text-sm text-gray-500 dark:text-gray-300">
        Tutaj widzisz wyłącznie zdjęcia świadomie udostępnione Twojej rodzinie.
        Twoje prywatne zdjęcia pozostają w zakładce „Moje zdjęcia”.
      </p>
      <button
        type="button"
        onclick={refresh}
        disabled={loading || !activeUserId}
        class="rounded-lg border px-4 py-2 text-sm hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800"
      >
        Odśwież
      </button>
    </div>

    {#if error}
      <p class="mb-4 rounded-lg border border-red-300 p-4 text-sm text-red-600" role="alert">{error}</p>
    {/if}

    {#if !activeUserId}
      <p role="status">Zaloguj się, aby zobaczyć zdjęcia swojej rodziny.</p>
    {:else if !loading && photos.length === 0 && !error}
      <p role="status" class="py-12 text-center text-gray-500">
        Nie ma jeszcze zdjęć udostępnionych rodzinie.
      </p>
    {/if}

    {#each months as month (month.key)}
      <section aria-label={month.title} class="mb-9">
        <h2 class="mb-3 text-lg capitalize" id={'family-month-' + month.key}>{month.title}</h2>
        <div class="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7">
          {#each month.photos as photo (photo.id)}
            <button
              type="button"
              class="aspect-square overflow-hidden rounded-md bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 dark:bg-gray-800"
              aria-label={'Pokaż zdjęcie z ' + new Date(photo.localDateTime).toLocaleDateString('pl-PL')}
              onclick={() => (selectedPhoto = photo)}
            >
              <img
                src={getAssetMediaUrl({ id: photo.id, size: AssetMediaSize.Thumbnail })}
                alt="Zdjęcie rodzinne"
                loading="lazy"
                class="size-full object-cover"
              />
            </button>
          {/each}
        </div>
      </section>
    {/each}

    {#if loading}
      <p class="py-6 text-center text-sm text-gray-500" role="status">Wczytywanie zdjęć rodziny…</p>
    {:else if nextPage !== null && activeUserId}
      <div class="flex justify-center">
        <button type="button" onclick={() => void loadMore()} class="rounded-lg border px-5 py-2 hover:bg-gray-100 dark:hover:bg-gray-800">
          Pokaż starsze zdjęcia
        </button>
      </div>
    {/if}
  </div>
</UserPageLayout>

{#if selectedPhoto && activeUserId}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3" role="presentation">
    <button
      type="button"
      aria-label="Zamknij podgląd zdjęcia"
      class="absolute top-4 right-4 rounded-lg bg-black/60 px-4 py-2 text-white"
      onclick={() => (selectedPhoto = null)}
    >
      Zamknij
    </button>
    <img
      src={getAssetMediaUrl({ id: selectedPhoto.id, size: AssetMediaSize.Preview })}
      alt="Podgląd zdjęcia rodzinnego"
      class="max-h-[85vh] max-w-full object-contain"
    />
  </div>
{/if}
