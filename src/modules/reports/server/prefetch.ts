import 'server-only';
import { dehydrate } from '@tanstack/react-query';
import { makeQueryClient } from '@/trpc/query-client';
import { serverTrpc } from '@/trpc/server-caller';

/**
 * Prefetch reports page data on the server
 * This prefetches reports and templates to avoid exposing data in client-side API calls
 */
export async function prefetchReportsData() {
  const queryClient = makeQueryClient();
  const trpc = await serverTrpc();
  
  try {
    const [
      reports,
      templates,
      onboardingStatus,
      accessibilityPrefs
    ] = await Promise.allSettled([
      trpc.reports.list({ page: 1, pageSize: 20 }),
      trpc.reports.listTemplates({ includeSystem: true }),
      trpc.users.getOnboardingStatus(),
      trpc.users.getAccessibilityPreferences(),
    ]);

    if (reports.status === 'fulfilled') {
      queryClient.setQueryData(
        [['reports', 'list'], { input: { page: 1, pageSize: 20 }, type: 'query' }],
        reports.value
      );
    }

    if (templates.status === 'fulfilled') {
      queryClient.setQueryData(
        [['reports', 'listTemplates'], { input: { includeSystem: true }, type: 'query' }],
        templates.value
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
    console.debug('Could not prefetch reports data:', error);
  }
  
  return dehydrate(queryClient);
}
