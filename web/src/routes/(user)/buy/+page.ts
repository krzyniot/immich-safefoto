import { redirect } from '@sveltejs/kit';
import { Route } from '$lib/route';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { authenticate } from '$lib/utils/auth';
import { activateProduct, getActivationKey } from '$lib/utils/license-utils';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url);

  const licenseKey = url.searchParams.get('licenseKey');
  let activationKey = url.searchParams.get('activationKey');

  try {
    if (licenseKey && !activationKey) {
      activationKey = await getActivationKey(licenseKey);
    }

    if (licenseKey && activationKey) {
      const response = await activateProduct(licenseKey, activationKey);
      if (response.activatedAt !== '') {
        authManager.isPurchased = true;
      }
    }
  } catch (error) {
    console.log('error navigating to /buy', error);
  }

  // SafeFoto retains activation callbacks, but does not present purchase prompts.
  throw redirect(307, Route.photos());
}) satisfies PageLoad;
