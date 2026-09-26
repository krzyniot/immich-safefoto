<script lang="ts">
  import UserAvatar from '$lib/components/shared-components/UserAvatar.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { serverConfigManager } from '$lib/managers/server-config-manager.svelte';

  const panelUrl = $derived(serverConfigManager.value.safeFotoPanelUrl);
</script>

<section class="my-4">
  <div class="flex flex-col gap-4 sm:ms-8">
    <div class="flex items-center gap-4 rounded-2xl border border-gray-200 p-4 dark:border-immich-dark-gray">
      <UserAvatar user={authManager.user} size="lg" noTitle />
      <div class="min-w-0 flex-1">
        <p class="truncate text-base text-secondary dark:text-immich-dark-fg">{authManager.user.name}</p>
        <p class="truncate text-sm text-gray-500 dark:text-gray-400">{authManager.user.email}</p>
      </div>
    </div>

    <p class="text-sm text-gray-600 dark:text-gray-300">
      Imię i zdjęcie profilowe są wspólne dla SafeFoto i galerii zdjęć.
    </p>

    <div class="flex justify-end">
      <a
        class="rounded-full bg-primary px-4 py-2 text-sm text-white transition hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:bg-immich-dark-primary dark:text-immich-dark-bg"
        href={panelUrl}
      >
        Edytuj profil w SafeFoto
      </a>
    </div>
  </div>
</section>
