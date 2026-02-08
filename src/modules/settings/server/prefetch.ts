import 'server-only';
import { dehydrate } from '@tanstack/react-query';
import { makeQueryClient } from '@/trpc/query-client';
import { serverTrpc } from '@/trpc/server-caller';

/**
 * Prefetch general settings page data on the server
 */
export async function prefetchGeneralSettingsData() {
  const queryClient = makeQueryClient();
  const trpc = await serverTrpc();
  
  try {
    const [generalSettings, onboardingStatus, accessibilityPrefs] = await Promise.allSettled([
      trpc.settings.getGeneralSettings(),
      trpc.users.getOnboardingStatus(),
      trpc.users.getAccessibilityPreferences(),
    ]);

    if (generalSettings.status === 'fulfilled') {
      queryClient.setQueryData(
        [['settings', 'getGeneralSettings'], { input: undefined, type: 'query' }],
        generalSettings.value
      );
    }

    if (onboardingStatus.status === 'fulfilled') {
      queryClient.setQueryData(
        [['users', 'getOnboardingStatus'], { input: undefined, type: 'query' }],
        onboardingStatus.value
      );
    }

    if (accessibilityPrefs.status === 'fulfilled') {
      queryClient.setQueryData(
        [['users', 'getAccessibilityPreferences'], { input: undefined, type: 'query' }],
        accessibilityPrefs.value
      );
    }
  } catch (error) {
    console.debug('Could not prefetch general settings data:', error);
  }
  
  return dehydrate(queryClient);
}

/**
 * Prefetch security settings page data on the server
 */
export async function prefetchSecuritySettingsData() {
  const queryClient = makeQueryClient();
  const trpc = await serverTrpc();
  
  try {
    const [
      securitySettings,
      passwordPolicy,
      threatDetectionSettings,
      threatEvents,
      ipWhitelists,
      ipSecuritySettings,
      geographicRestrictions,
      onboardingStatus,
      accessibilityPrefs
    ] = await Promise.allSettled([
      trpc.settings.getSecuritySettings(),
      trpc.settings.getPasswordPolicy(),
      trpc.settings.getThreatDetectionSettings(),
      trpc.settings.getThreatEvents({ page: 1, limit: 20 }),
      trpc.settings.getIpWhitelists(),
      trpc.settings.getIpSecuritySettings(),
      trpc.settings.getGeographicRestrictions(),
      trpc.users.getOnboardingStatus(),
      trpc.users.getAccessibilityPreferences(),
    ]);

    if (securitySettings.status === 'fulfilled') {
      queryClient.setQueryData(
        [['settings', 'getSecuritySettings'], { input: undefined, type: 'query' }],
        securitySettings.value
      );
    }

    if (passwordPolicy.status === 'fulfilled') {
      queryClient.setQueryData(
        [['settings', 'getPasswordPolicy'], { input: undefined, type: 'query' }],
        passwordPolicy.value
      );
    }

    if (threatDetectionSettings.status === 'fulfilled') {
      queryClient.setQueryData(
        [['settings', 'getThreatDetectionSettings'], { input: undefined, type: 'query' }],
        threatDetectionSettings.value
      );
    }

    if (threatEvents.status === 'fulfilled') {
      queryClient.setQueryData(
        [['settings', 'getThreatEvents'], { input: { page: 1, limit: 20 }, type: 'query' }],
        threatEvents.value
      );
    }

    if (ipWhitelists.status === 'fulfilled') {
      queryClient.setQueryData(
        [['settings', 'getIpWhitelists'], { input: undefined, type: 'query' }],
        ipWhitelists.value
      );
    }

    if (ipSecuritySettings.status === 'fulfilled') {
      queryClient.setQueryData(
        [['settings', 'getIpSecuritySettings'], { input: undefined, type: 'query' }],
        ipSecuritySettings.value
      );
    }

    if (geographicRestrictions.status === 'fulfilled') {
      queryClient.setQueryData(
        [['settings', 'getGeographicRestrictions'], { input: undefined, type: 'query' }],
        geographicRestrictions.value
      );
    }

    if (onboardingStatus.status === 'fulfilled') {
      queryClient.setQueryData(
        [['users', 'getOnboardingStatus'], { input: undefined, type: 'query' }],
        onboardingStatus.value
      );
    }

    if (accessibilityPrefs.status === 'fulfilled') {
      queryClient.setQueryData(
        [['users', 'getAccessibilityPreferences'], { input: undefined, type: 'query' }],
        accessibilityPrefs.value
      );
    }
  } catch (error) {
    console.debug('Could not prefetch security settings data:', error);
  }
  
  return dehydrate(queryClient);
}

/**
 * Prefetch MFA settings page data on the server
 */
export async function prefetchMfaSettingsData() {
  const queryClient = makeQueryClient();
  const trpc = await serverTrpc();
  
  try {
    const [mfaSettings, credentialsStatus, onboardingStatus, accessibilityPrefs] = await Promise.allSettled([
      trpc.settings.getMfaSettings(),
      trpc.settings.checkMfaCredentialsStatus(),
      trpc.users.getOnboardingStatus(),
      trpc.users.getAccessibilityPreferences(),
    ]);

    if (mfaSettings.status === 'fulfilled') {
      queryClient.setQueryData(
        [['settings', 'getMfaSettings'], { input: undefined, type: 'query' }],
        mfaSettings.value
      );
    }

    if (credentialsStatus.status === 'fulfilled') {
      queryClient.setQueryData(
        [['settings', 'checkMfaCredentialsStatus'], { input: undefined, type: 'query' }],
        credentialsStatus.value
      );
    }

    if (onboardingStatus.status === 'fulfilled') {
      queryClient.setQueryData(
        [['users', 'getOnboardingStatus'], { input: undefined, type: 'query' }],
        onboardingStatus.value
      );
    }

    if (accessibilityPrefs.status === 'fulfilled') {
      queryClient.setQueryData(
        [['users', 'getAccessibilityPreferences'], { input: undefined, type: 'query' }],
        accessibilityPrefs.value
      );
    }
  } catch (error) {
    console.debug('Could not prefetch MFA settings data:', error);
  }
  
  return dehydrate(queryClient);
}

/**
 * Prefetch MFA credentials settings page data on the server
 */
export async function prefetchMfaCredentialsData() {
  const queryClient = makeQueryClient();
  const trpc = await serverTrpc();
  
  try {
    const [mfaCredentials, onboardingStatus, accessibilityPrefs] = await Promise.allSettled([
      trpc.settings.getMfaCredentials(),
      trpc.users.getOnboardingStatus(),
      trpc.users.getAccessibilityPreferences(),
    ]);

    if (mfaCredentials.status === 'fulfilled') {
      queryClient.setQueryData(
        [['settings', 'getMfaCredentials'], { input: undefined, type: 'query' }],
        mfaCredentials.value
      );
    }

    if (onboardingStatus.status === 'fulfilled') {
      queryClient.setQueryData(
        [['users', 'getOnboardingStatus'], { input: undefined, type: 'query' }],
        onboardingStatus.value
      );
    }

    if (accessibilityPrefs.status === 'fulfilled') {
      queryClient.setQueryData(
        [['users', 'getAccessibilityPreferences'], { input: undefined, type: 'query' }],
        accessibilityPrefs.value
      );
    }
  } catch (error) {
    console.debug('Could not prefetch MFA credentials data:', error);
  }
  
  return dehydrate(queryClient);
}

/**
 * Prefetch compliance settings page data on the server
 */
export async function prefetchComplianceSettingsData() {
  const queryClient = makeQueryClient();
  const trpc = await serverTrpc();
  
  try {
    const [dataRetentionPolicy, complianceReport, onboardingStatus, accessibilityPrefs] = await Promise.allSettled([
      trpc.settings.getDataRetentionPolicy(),
      trpc.settings.getComplianceReport(),
      trpc.users.getOnboardingStatus(),
      trpc.users.getAccessibilityPreferences(),
    ]);

    if (dataRetentionPolicy.status === 'fulfilled') {
      queryClient.setQueryData(
        [['settings', 'getDataRetentionPolicy'], { input: undefined, type: 'query' }],
        dataRetentionPolicy.value
      );
    }

    if (complianceReport.status === 'fulfilled') {
      queryClient.setQueryData(
        [['settings', 'getComplianceReport'], { input: undefined, type: 'query' }],
        complianceReport.value
      );
    }

    if (onboardingStatus.status === 'fulfilled') {
      queryClient.setQueryData(
        [['users', 'getOnboardingStatus'], { input: undefined, type: 'query' }],
        onboardingStatus.value
      );
    }

    if (accessibilityPrefs.status === 'fulfilled') {
      queryClient.setQueryData(
        [['users', 'getAccessibilityPreferences'], { input: undefined, type: 'query' }],
        accessibilityPrefs.value
      );
    }
  } catch (error) {
    console.debug('Could not prefetch compliance settings data:', error);
  }
  
  return dehydrate(queryClient);
}
