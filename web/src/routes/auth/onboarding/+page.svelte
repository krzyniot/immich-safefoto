<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import OnboardingCard from './OnboardingCard.svelte';
  import OnboardingHello from './OnboardingHello.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { serverConfigManager } from '$lib/managers/server-config-manager.svelte';
  import { Route } from '$lib/route';
  import { setUserOnboarding, updateAdminOnboarding } from '@immich/sdk';

  interface OnboardingStep {
    name: string;
    component: typeof OnboardingHello;
    title?: string;
    icon?: string;
  }

  const onboardingSteps: OnboardingStep[] = $derived([{ name: 'hello', component: OnboardingHello }]);

  const index = $derived.by(() => {
    const stepState = page.url.searchParams.get('step');
    const temporaryIndex = onboardingSteps.findIndex((step) => step.name === stepState);
    return temporaryIndex === -1 ? 0 : temporaryIndex;
  });
  const previousStepIndex = $derived(index > 0 ? index - 1 : -1);
  const nextStepIndex = $derived(index + 1 < onboardingSteps.length ? index + 1 : -1);

  const handleNextClicked = async () => {
    if (nextStepIndex == -1) {
      if (authManager.user.isAdmin) {
        await updateAdminOnboarding({ adminOnboardingUpdateDto: { isOnboarded: true } });
        await serverConfigManager.loadServerConfig();
      }

      await setUserOnboarding({
        onboardingDto: { isOnboarded: true },
      });

      await goto(Route.photos());
    } else {
      await goto(Route.onboarding({ step: onboardingSteps[nextStepIndex].name }));
    }
  };

  const handlePrevious = async () => {
    if (previousStepIndex === -1) {
      return;
    }

    await goto(Route.onboarding({ step: onboardingSteps[previousStepIndex].name }));
  };

  const OnboardingStep = $derived(onboardingSteps[index].component);
</script>

<section id="onboarding-page" class="flex min-h-dvh min-w-dvw p-4">
  <div class="flex w-full flex-col">
    <div class="m-auto flex w-[min(100%,800px)] place-content-center place-items-center py-8">
      <OnboardingCard
        title={onboardingSteps[index].title}
        icon={onboardingSteps[index].icon}
        onNext={handleNextClicked}
        onPrevious={handlePrevious}
        previousTitle={onboardingSteps[previousStepIndex]?.title}
        nextTitle={onboardingSteps[nextStepIndex]?.title ?? 'Przejdź do zdjęć'}
      >
        <OnboardingStep />
      </OnboardingCard>
    </div>
  </div>
</section>
