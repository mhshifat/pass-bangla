import 'server-only';
import { dehydrate } from '@tanstack/react-query';
import { makeQueryClient } from '@/trpc/query-client';
import { serverTrpc } from '@/trpc/server-caller';

/**
 * Prefetch passwords page data including export filters and rotation reminders
 * This prefetches data on the server to avoid client-side API calls
 * 
 * @example
 * ```tsx
 * export default async function PasswordsPage() {
 *   const dehydratedState = await prefetchPasswordsData()
 *   
 *   return (
 *     <HydrationBoundary state={dehydratedState}>
 *       <PasswordsContent />
 *     </HydrationBoundary>
 *   )
 * }
 * ```
 */
export async function prefetchPasswordsData() {
  const queryClient = makeQueryClient();
  const trpc = await serverTrpc();
  
  try {
    // Prefetch export filters and rotation reminders in parallel
    const [exportFilters, reminders30, reminders365] = await Promise.allSettled([
      trpc.passwords.getExportFilters(),
      trpc.passwordRotation.getReminders({ daysAhead: 30 }),
      trpc.passwordRotation.getReminders({ daysAhead: 365 }),
    ]);

    // Set each query data in the cache with the correct tRPC query key format
    if (exportFilters.status === 'fulfilled') {
      queryClient.setQueryData(
        [['passwords', 'getExportFilters'], { input: undefined, type: 'query' }],
        exportFilters.value
      );
    }

    if (reminders30.status === 'fulfilled') {
      queryClient.setQueryData(
        [['passwordRotation', 'getReminders'], { input: { daysAhead: 30 }, type: 'query' }],
        reminders30.value
      );
    }

    if (reminders365.status === 'fulfilled') {
      queryClient.setQueryData(
        [['passwordRotation', 'getReminders'], { input: { daysAhead: 365 }, type: 'query' }],
        reminders365.value
      );
    }
  } catch (error) {
    // If there's an error, the client will handle it
    console.debug('Could not prefetch passwords data:', error);
  }
  
  return dehydrate(queryClient);
}
