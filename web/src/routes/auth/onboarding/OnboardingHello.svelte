<script lang="ts">
  import { authManager } from '$lib/managers/auth-manager.svelte';
</script>

<div class="flex flex-col items-center gap-4 py-4 text-center">
  <img
    src="/safefoto/logo.png"
    alt="Logo SafeFoto"
    width="112"
    height="112"
    class="size-28 object-contain"
  />
  <p class="text-4xl font-normal text-primary">SafeFoto</p>
  <p class="text-3xl font-normal">Witaj, {authManager.user.name}</p>
  <p class="max-w-2xl pb-4 text-xl font-normal text-gray-600 dark:text-gray-300">
    Twoje konto jest gotowe. Możesz już bezpiecznie przechowywać swoje zdjęcia i filmy.
  </p>
</div>
