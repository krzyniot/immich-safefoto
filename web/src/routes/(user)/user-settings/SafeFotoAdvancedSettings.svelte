<script lang="ts">
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import type { ApiKeyResponseDto } from '@immich/sdk';
  import DownloadSettings from './DownloadSettings.svelte';
  import FeatureSettings from './FeatureSettings.svelte';
  import OauthSettings from './OauthSettings.svelte';
  import PartnerSettings from './PartnerSettings.svelte';
  import SafeFotoLegalSettings from './SafeFotoLegalSettings.svelte';
  import UserApiKeyList from './UserApiKeyList.svelte';

  type Props = {
    keys: ApiKeyResponseDto[];
  };

  let { keys = $bindable() }: Props = $props();
</script>

<div class="space-y-5 py-3 sm:ms-8">
  <section class="rounded-2xl border border-gray-200 p-4 dark:border-immich-dark-gray">
    <h3 class="text-base text-secondary dark:text-immich-dark-fg">Integracje i klucze API</h3>
    <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
      Dla zewnętrznych programów, skryptów i narzędzi przesyłających zdjęcia. Klucz daje dostęp do wybranych danych
      konta — nie udostępniaj go innym osobom.
    </p>
    <UserApiKeyList bind:keys />
  </section>

  <section class="rounded-2xl border border-gray-200 p-4 dark:border-immich-dark-gray">
    <h3 class="text-base text-secondary dark:text-immich-dark-fg">Pobieranie i archiwa</h3>
    <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">Rozmiar archiwum i sposób pobierania zdjęć ruchomych.</p>
    <DownloadSettings />
  </section>

  <section class="rounded-2xl border border-gray-200 p-4 dark:border-immich-dark-gray">
    <h3 class="text-base text-secondary dark:text-immich-dark-fg">Funkcje galerii</h3>
    <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
      Foldery, osoby, wspomnienia, tagi, oceny, Cast i elementy paska bocznego.
    </p>
    <FeatureSettings />
  </section>

  <section class="rounded-2xl border border-gray-200 p-4 dark:border-immich-dark-gray">
    <h3 class="text-base text-secondary dark:text-immich-dark-fg">Udostępnianie partnerskie</h3>
    <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
      Dodatkowy mechanizm Immicha, niezależny od rodziny SafeFoto.
    </p>
    <PartnerSettings />
  </section>

  {#if featureFlagsManager.value.oauth}
    <section class="rounded-2xl border border-gray-200 p-4 dark:border-immich-dark-gray">
      <h3 class="text-base text-secondary dark:text-immich-dark-fg">Połączenie OAuth</h3>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">Połączenie konta z zewnętrznym dostawcą logowania.</p>
      <OauthSettings />
    </section>
  {/if}

  <section class="rounded-2xl border border-gray-200 p-4 dark:border-immich-dark-gray">
    <h3 class="text-base text-secondary dark:text-immich-dark-fg">Informacje prawne i kod źródłowy</h3>
    <SafeFotoLegalSettings />
  </section>
</div>
