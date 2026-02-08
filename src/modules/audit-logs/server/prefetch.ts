import 'server-only';
import { dehydrate } from '@tanstack/react-query';
import { makeQueryClient } from '@/trpc/query-client';
import { serverTrpc } from '@/trpc/server-caller';

/**
 * Prefetch audit logs page data on the server
 * This prefetches audit logs and related data to avoid exposing sensitive info in client-side API calls
 */
export async function prefetchAuditLogsData() {
  const queryClient = makeQueryClient();
  const trpc = await serverTrpc();
  
  try {
    const [
      stats,
      actionTypes,
      logs,
      onboardingStatus,
      accessibilityPrefs
    ] = await Promise.allSettled([
      trpc.auditLogs.stats({ days: 30 }),
      trpc.auditLogs.getActionTypes(),
      trpc.auditLogs.list({ page: 1, pageSize: 20 }),
      trpc.users.getOnboardingStatus(),
      trpc.users.getAccessibilityPreferences(),
    ]);

    if (stats.status === 'fulfilled') {
      queryClient.setQueryData(
        [['auditLogs', 'stats'], { input: { days: 30 }, type: 'query' }],
        stats.value
      );
    }

    if (actionTypes.status === 'fulfilled') {
      queryClient.setQueryData(
        [['auditLogs', 'getActionTypes'], { input: undefined, type: 'query' }],
        actionTypes.value
      );
    }

    if (logs.status === 'fulfilled') {
      queryClient.setQueryData(
        [['auditLogs', 'list'], { input: { page: 1, pageSize: 20 }, type: 'query' }],
        logs.value
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
    console.debug('Could not prefetch audit logs data:', error);
  }
  
  return dehydrate(queryClient);
}
