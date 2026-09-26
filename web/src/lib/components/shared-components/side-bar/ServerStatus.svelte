<script lang="ts">
  import { websocketStore } from '$lib/stores/websocket';
  import { t } from 'svelte-i18n';

  const { connected } = websocketStore;
</script>

<div class="flex min-w-52 items-center ps-5 pe-1 text-sm dark:text-immich-dark-fg">
  {#if $connected}
    <div class="flex items-center gap-2">
      <div class="size-1.75 rounded-full bg-green-500"></div>
      <p class="dark:text-immich-gray">{$t('server_online')}</p>
    </div>
  {:else}
    <div class="flex items-center gap-2">
      <div class="size-1.75 rounded-full bg-red-500"></div>
      <p class="text-red-500">{$t('server_offline')}</p>
    </div>
  {/if}
</div>
