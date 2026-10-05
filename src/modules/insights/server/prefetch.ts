import 'server-only';
import { dehydrate } from '@tanstack/react-query';
import { makeQueryClient } from '@/trpc/query-client';
import { serverTrpc } from '@/trpc/server-caller';

/**
 * Prefetch insights page data on the server
 * Only the default (overview) tab is prefetched; the other tabs load their data when opened
 */
export async function prefetchInsightsData() {
  const queryClient = makeQueryClient();
  const trpc = await serverTrpc();
  
  try {
    const [
      securityPosture,
      passwordHealthScore,
      onboardingStatus,
      accessibilityPrefs
    ] = await Promise.allSettled([
      trpc.insights.securityPosture({}),
      trpc.insights.passwordHealthScore({}),
      trpc.users.getOnboardingStatus(),
      trpc.users.getAccessibilityPreferences(),
    ]);

    if (securityPosture.status === 'fulfilled') {
      queryClient.setQueryData(
        [['insights', 'securityPosture'], { input: {}, type: 'query' }],
        securityPosture.value
      );
    }

    if (passwordHealthScore.status === 'fulfilled') {
      queryClient.setQueryData(
        [['insights', 'passwordHealthScore'], { input: {}, type: 'query' }],
        passwordHealthScore.value
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
    console.debug('Could not prefetch insights data:', error);
  }
  
  return dehydrate(queryClient);
}
