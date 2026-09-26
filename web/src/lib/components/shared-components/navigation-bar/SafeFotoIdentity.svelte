<script lang="ts">
  import { serverConfigManager } from '$lib/managers/server-config-manager.svelte';
  import { onMount } from 'svelte';

  type HouseholdSummary = {
    name: string | null;
  };

  let familyName = $state('Moja rodzina');
  const panelUrl = $derived(serverConfigManager.value.safeFotoPanelUrl);

  onMount(() => {
    void loadFamilyName();
  });

  const loadFamilyName = async () => {
    try {
      const response = await fetch('/api/users/me/household');
      if (!response.ok) {
        return;
      }

      const household = (await response.json()) as HouseholdSummary;
      const name = household.name?.trim();
      familyName = name || 'Moja rodzina';
    } catch (error) {
      console.error('Failed to load SafeFoto family name', error);
    }
  };
</script>

<div class="min-w-0 flex-none text-center text-secondary dark:text-immich-dark-fg">
  <div class="truncate text-xs leading-tight tracking-wide sm:text-sm">
    <span class="hidden sm:inline">Immich · </span><span>SafeFoto</span>
  </div>
  <div class="mt-0.5 flex min-w-0 items-center justify-center gap-1.5 text-[10px] leading-tight sm:text-xs">
    <span class="max-w-28 truncate sm:max-w-44" title={familyName}>{familyName}</span>
    <a
      class="pointer-events-auto inline-flex shrink-0 items-center rounded-full border border-primary/20 px-1.5 py-0.5 text-[9px] text-primary transition hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:px-2 sm:text-[10px] dark:border-immich-dark-primary/40 dark:text-immich-dark-primary dark:hover:bg-immich-dark-primary/10"
      href={panelUrl}
      aria-label="Przejdź do panelu SafeFoto"
      title="Panel SafeFoto"
    >
      <span class="hidden md:inline">Panel SafeFoto</span>
      <span class="md:hidden" aria-hidden="true">↗</span>
    </a>
  </div>
</div>
