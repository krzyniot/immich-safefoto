<script lang="ts">
  import SettingAccordion from '$lib/components/shared-components/settings/SettingAccordion.svelte';
  import type { ApiKeyResponseDto, SessionResponseDto } from '@immich/sdk';
  import {
    mdiAccountOutline,
    mdiBellOutline,
    mdiCogOutline,
    mdiDevices,
    mdiFormTextboxPassword,
    mdiLockSmart,
    mdiServerOutline,
    mdiTuneVariant,
  } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import AppSettings from './AppSettings.svelte';
  import ChangePasswordSettings from './ChangePasswordSettings.svelte';
  import DeviceList from './DeviceList.svelte';
  import NotificationsSettings from './NotificationsSettings.svelte';
  import ChangePinCodeSettings from './PinCodeSettings.svelte';
  import SafeFotoAdvancedSettings from './SafeFotoAdvancedSettings.svelte';
  import SafeFotoProfileSettings from './SafeFotoProfileSettings.svelte';
  import UserUsageStatistic from './UserUsageStatistic.svelte';

  interface Props {
    keys?: ApiKeyResponseDto[];
    sessions?: SessionResponseDto[];
  }

  let { keys = $bindable([]), sessions = $bindable([]) }: Props = $props();
</script>

<SettingAccordion
  icon={mdiCogOutline}
  key="app-settings"
  title={$t('app_settings')}
  subtitle={$t('manage_the_app_settings')}
>
  <AppSettings />
</SettingAccordion>

<SettingAccordion
  icon={mdiAccountOutline}
  key="account"
  title={$t('account')}
  subtitle="Profil wspólny z panelem SafeFoto"
>
  <SafeFotoProfileSettings />
</SettingAccordion>

<SettingAccordion
  icon={mdiServerOutline}
  key="user-usage-info"
  title={$t('user_usage_stats')}
  subtitle={$t('user_usage_stats_description')}
>
  <UserUsageStatistic />
</SettingAccordion>

<SettingAccordion
  icon={mdiDevices}
  key="authorized-devices"
  title={$t('authorized_devices')}
  subtitle={$t('manage_your_devices')}
>
  <DeviceList bind:devices={sessions} />
</SettingAccordion>

<SettingAccordion
  icon={mdiBellOutline}
  key="notifications"
  title={$t('notifications')}
  subtitle={$t('notifications_setting_description')}
>
  <NotificationsSettings />
</SettingAccordion>

<SettingAccordion
  icon={mdiFormTextboxPassword}
  key="password"
  title={$t('password')}
  subtitle={$t('change_your_password')}
>
  <ChangePasswordSettings />
</SettingAccordion>

<SettingAccordion
  icon={mdiLockSmart}
  key="user-pin-code-settings"
  title={$t('user_pin_code_settings')}
  subtitle={$t('user_pin_code_settings_description')}
  autoScrollTo={true}
>
  <ChangePinCodeSettings />
</SettingAccordion>

<SettingAccordion
  icon={mdiTuneVariant}
  key="safefoto-advanced"
  title="Zaawansowane"
  subtitle="Integracje i rzadziej używane ustawienia galerii"
>
  <SafeFotoAdvancedSettings bind:keys />
</SettingAccordion>
