import 'server-only';
import { dehydrate } from '@tanstack/react-query';
import { makeQueryClient } from '@/trpc/query-client';
import { serverTrpc } from '@/trpc/server-caller';

/**
 * Prefetch insights page data on the server
 * This prefetches all insights data to avoid exposing sensitive analytics in client-side API calls
 */
export async function prefetchInsightsData() {
  const queryClient = makeQueryClient();
  const trpc = await serverTrpc();
  
  try {
    const [
      userEngagement,
      trends,
      teamCollaboration,
      securityPosture,
      passwordHealthScore,
      onboardingStatus,
      accessibilityPrefs
    ] = await Promise.allSettled([
      trpc.insights.userEngagement({}),
      trpc.insights.trends({ metric: 'passwords', period: '30d' }),
      trpc.insights.teamCollaboration({}),
      trpc.insights.securityPosture({}),
      trpc.insights.passwordHealthScore({}),
      trpc.users.getOnboardingStatus(),
      trpc.users.getAccessibilityPreferences(),
    ]);

    if (userEngagement.status === 'fulfilled') {
      queryClient.setQueryData(
        [['insights', 'userEngagement'], { input: {}, type: 'query' }],
        userEngagement.value
      );
    }

    if (trends.status === 'fulfilled') {
      queryClient.setQueryData(
        [['insights', 'trends'], { input: { metric: 'passwords', period: '30d' }, type: 'query' }],
        trends.value
      );
    }

    if (teamCollaboration.status === 'fulfilled') {
      queryClient.setQueryData(
        [['insights', 'teamCollaboration'], { input: {}, type: 'query' }],
        teamCollaboration.value
      );
    }

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
