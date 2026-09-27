<script lang="ts">
  import { onMount } from 'svelte';

  type HouseholdSummary = {
    name: string | null;
  };

  let familyName = $state('Moja rodzina');

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

<div class="min-w-0 text-left text-secondary dark:text-immich-dark-fg">
  <div class="truncate text-base leading-tight tracking-wide">SafeFoto</div>
  <div class="mt-0.5 max-w-28 truncate text-xs leading-tight sm:max-w-40" title={familyName}>{familyName}</div>
</div>
