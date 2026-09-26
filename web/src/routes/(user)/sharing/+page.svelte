<script lang="ts">
  import empty2Url from '$lib/assets/empty-2.svg';
  import Albums from '$lib/components/album-page/AlbumsList.svelte';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import EmptyPlaceholder from '$lib/components/shared-components/EmptyPlaceholder.svelte';
  import { getAlbumsActions } from '$lib/services/album.service';
  import {
    AlbumFilter,
    AlbumGroupBy,
    AlbumSortBy,
    AlbumViewMode,
    SortOrder,
    type AlbumViewSettings,
  } from '$lib/stores/preferences.store';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  type Props = {
    data: PageData;
  };

  let { data }: Props = $props();

  const settings: AlbumViewSettings = {
    view: AlbumViewMode.Cover,
    filter: AlbumFilter.Shared,
    groupBy: AlbumGroupBy.None,
    groupOrder: SortOrder.Desc,
    sortBy: AlbumSortBy.MostRecentPhoto,
    sortOrder: SortOrder.Desc,
    collapsedGroups: {},
  };

  const { Create: CreateAlbum } = $derived(getAlbumsActions($t));
</script>

<UserPageLayout title={data.meta.title} actions={[CreateAlbum]}>
  <div class="flex flex-col">
    <div class="mt-2 mb-6">
      <div>
        <p class="mb-4 font-medium dark:text-immich-dark-fg">{$t('albums')}</p>
      </div>

      <div>
        <!-- Shared Album List -->
        <Albums sharedAlbums={data.sharedAlbums} userSettings={settings} showOwner>
          <!-- Empty List -->
          {#snippet empty()}
            <EmptyPlaceholder text={$t('no_shared_albums_message')} src={empty2Url} class="mx-auto mt-10" />
          {/snippet}
        </Albums>
      </div>
    </div>
  </div>
</UserPageLayout>
