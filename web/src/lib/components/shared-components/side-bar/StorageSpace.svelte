<script lang="ts">
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { serverConfigManager } from '$lib/managers/server-config-manager.svelte';
  import { locale } from '$lib/stores/preferences.store';
  import { userInteraction } from '$lib/stores/user.svelte';
  import { requestServerInfo } from '$lib/utils/auth';
  import { LoadingSpinner, Meter } from '@immich/ui';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  let hasQuota = $derived(authManager.user.quotaSizeInBytes !== null);
  let availableBytes = $derived(
    (hasQuota && authManager.authenticated
      ? authManager.user.quotaSizeInBytes
      : userInteraction.serverInfo?.diskSizeRaw) || 0,
  );
  let usedBytes = $derived(
    (hasQuota && authManager.authenticated
      ? authManager.user.quotaUsageInBytes
      : userInteraction.serverInfo?.diskUseRaw) || 0,
  );
  const panelUrl = $derived(serverConfigManager.value.safeFotoPanelUrl);

  const formatStorage = (bytes: number, maxPrecision = 1) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const magnitude = Math.min(Math.floor(Math.log(bytes === 0 ? 1 : bytes) / Math.log(1000)), units.length - 1);
    const size = Number.parseFloat((bytes / 1000 ** magnitude).toFixed(maxPrecision));
    return `${size.toLocaleString($locale)} ${units[magnitude]}`;
  };

  const thresholds = [
    { from: 0.8, className: 'bg-warning' },
    { from: 0.95, className: 'bg-danger' },
  ];

  onMount(async () => {
    if (userInteraction.serverInfo && authManager.authenticated) {
      return;
    }
    await requestServerInfo();
  });
</script>

<div
  class="ms-4 min-w-52 rounded-lg bg-light-100 p-4 text-sm"
  title={$t('storage_usage', {
    values: {
      used: formatStorage(usedBytes, 3),
      available: formatStorage(availableBytes, 3),
    },
  })}
>
  {#if userInteraction.serverInfo}
    <Meter
      size="tiny"
      class="bg-light-200"
      containerClass="gap-2 leading-6"
      label={$t('storage')}
      valueLabel={$t('storage_usage', {
        values: {
          used: formatStorage(usedBytes),
          available: formatStorage(availableBytes),
        },
      })}
      value={usedBytes / availableBytes}
      {thresholds}
    />
    <a class="mt-2 block text-xs text-primary underline" href={panelUrl}>Cała pula rodziny w panelu SafeFoto</a>
  {:else}
    <p class="mb-4 font-medium text-immich-dark-gray dark:text-white">{$t('storage')}</p>
    <LoadingSpinner />
  {/if}
</div>
