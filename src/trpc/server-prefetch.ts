import 'server-only';
import { dehydrate } from '@tanstack/react-query';
import { makeQueryClient } from './query-client';
import { serverTrpc, getCurrentUserData } from './server-caller';

/**
 * Prefetch current user data for authenticated layouts
 * This prefetches the getCurrentUser query on the server to avoid client-side API calls
 * 
 * @example
 * ```tsx
 * export default async function AdminLayout({ children }) {
 *   const dehydratedState = await prefetchCurrentUser()
 *   
 *   return (
 *     <HydrationBoundary state={dehydratedState}>
 *       {children}
 *     </HydrationBoundary>
 *   )
 * }
 * ```
 */
export async function prefetchCurrentUser() {
  const queryClient = makeQueryClient();

  try {
    // Prefetch current user data (shared with the route guard: one execution per request)
    // The query key format for tRPC is: [['procedurePath'], { input, type: 'query' }]
    const userData = await getCurrentUserData();
    
    // Set the query data in the cache with the correct tRPC query key format
    queryClient.setQueryData(
      [
        ['auth', 'getCurrentUser'],
        { input: undefined, type: 'query' }
      ],
      userData
    );
  } catch (error) {
    // If user is not authenticated, that's okay - query will handle it on client
    console.debug('Could not prefetch user data:', error);
  }
  
  return dehydrate(queryClient);
}

/**
 * Prefetch user profile data for profile page
 * This prefetches the getProfile query on the server to avoid client-side API calls
 * 
 * @example
 * ```tsx
 * export default async function ProfilePage() {
 *   const dehydratedState = await prefetchUserProfile()
 *   
 *   return (
 *     <HydrationBoundary state={dehydratedState}>
 *       <EnhancedProfilePage />
 *     </HydrationBoundary>
 *   )
 * }
 * ```
 */
export async function prefetchUserProfile() {
  const queryClient = makeQueryClient();
  const trpc = await serverTrpc();
  
  try {
    // Prefetch user profile data
    const profileData = await trpc.users.getProfile();
    
    // Set the query data in the cache with the correct tRPC query key format
    queryClient.setQueryData(
      [
        ['users', 'getProfile'],
        { input: undefined, type: 'query' }
      ],
      profileData
    );
  } catch (error) {
    // If there's an error, the client will handle it
    console.debug('Could not prefetch user profile:', error);
  }
  
  return dehydrate(queryClient);
}

/**
 * Prefetch dashboard data for the admin dashboard page.
 * The queries are started but not awaited: the dehydrated state carries them as
 * pending promises, so the page streams and each card fills in as its own query
 * finishes instead of waiting for the slowest one. A failed query is retried
 * on the client.
 */
export async function prefetchDashboardData() {
  const queryClient = makeQueryClient();
  const trpc = await serverTrpc();

  const start = (path: string[], run: () => Promise<unknown>) => {
    void queryClient.prefetchQuery({
      queryKey: [path, { input: undefined, type: 'query' }],
      queryFn: run,
      retry: false,
    });
  };

  start(['dashboard', 'stats'], () => trpc.dashboard.stats());
  start(['dashboard', 'recentActivities'], () => trpc.dashboard.recentActivities());
  start(['dashboard', 'securityAlerts'], () => trpc.dashboard.securityAlerts());
  start(['dashboard', 'healthMetrics'], () => trpc.dashboard.healthMetrics());
  start(['users', 'getOnboardingStatus'], () => trpc.users.getOnboardingStatus());

  return dehydrate(queryClient);
}
