<script lang="ts">
  import { getAboutInfo, type ServerAboutResponseDto } from '@immich/sdk';
  import { onMount } from 'svelte';

  let info: ServerAboutResponseDto | undefined = $state();

  onMount(() => {
    void loadInfo();
  });

  const loadInfo = async () => {
    info = await getAboutInfo();
  };
</script>

<div class="space-y-3 text-sm text-gray-600 dark:text-gray-300">
  <p>
    SafeFoto korzysta ze zmodyfikowanej wersji Immicha. Kod źródłowy używanej wersji jest dostępny bezpłatnie na
    warunkach licencji GNU AGPL-3.0.
  </p>

  <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
    <dt>Immich</dt>
    <dd>{info?.version ?? '—'}</dd>
    <dt>Wersja SafeFoto</dt>
    <dd>{info?.sourceCommit?.slice(0, 9) ?? '—'}</dd>
  </dl>

  <div class="flex flex-wrap gap-3">
    {#if info?.sourceUrl}
      <a
        class="text-primary underline dark:text-immich-dark-primary"
        href={info.sourceUrl}
        target="_blank"
        rel="noreferrer"
      >
        Kod źródłowy tej wersji
      </a>
    {/if}
    <a
      class="text-primary underline dark:text-immich-dark-primary"
      href="https://www.gnu.org/licenses/agpl-3.0.html"
      target="_blank"
      rel="noreferrer"
    >
      Licencja GNU AGPL-3.0
    </a>
    <a
      class="text-primary underline dark:text-immich-dark-primary"
      href="https://github.com/immich-app/immich"
      target="_blank"
      rel="noreferrer"
    >
      Autorzy Immicha
    </a>
  </div>
</div>
