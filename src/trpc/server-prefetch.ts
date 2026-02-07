import 'server-only';
import { dehydrate } from '@tanstack/react-query';
import { makeQueryClient } from './query-client';
import { serverTrpc } from './server-caller';

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
  const trpc = await serverTrpc();
  
  try {
    // Prefetch current user data
    // The query key format for tRPC is: [['procedurePath'], { input, type: 'query' }]
    const userData = await trpc.auth.getCurrentUser();
    
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
 * Prefetch dashboard data for admin dashboard page
 * This prefetches all dashboard queries on the server to avoid client-side API calls
 * 
 * @example
 * ```tsx
 * export default async function DashboardPage() {
 *   const dehydratedState = await prefetchDashboardData()
 *   
 *   return (
 *     <HydrationBoundary state={dehydratedState}>
 *       <DashboardContent />
 *     </HydrationBoundary>
 *   )
 * }
 * ```
 */
export async function prefetchDashboardData() {
  const queryClient = makeQueryClient();
  const trpc = await serverTrpc();
  
  try {
    // Prefetch all dashboard data in parallel
    const [stats, activities, alerts, metrics, onboardingStatus] = await Promise.allSettled([
      trpc.dashboard.stats(),
      trpc.dashboard.recentActivities(),
      trpc.dashboard.securityAlerts(),
      trpc.dashboard.healthMetrics(),
      trpc.users.getOnboardingStatus(),
    ]);

    // Set each query data in the cache with the correct tRPC query key format
    if (stats.status === 'fulfilled') {
      queryClient.setQueryData(
        [['dashboard', 'stats'], { input: undefined, type: 'query' }],
        stats.value
      );
    }

    if (activities.status === 'fulfilled') {
      queryClient.setQueryData(
        [['dashboard', 'recentActivities'], { input: undefined, type: 'query' }],
        activities.value
      );
    }

    if (alerts.status === 'fulfilled') {
      queryClient.setQueryData(
        [['dashboard', 'securityAlerts'], { input: undefined, type: 'query' }],
        alerts.value
      );
    }

    if (metrics.status === 'fulfilled') {
      queryClient.setQueryData(
        [['dashboard', 'healthMetrics'], { input: undefined, type: 'query' }],
        metrics.value
      );
    }

    if (onboardingStatus.status === 'fulfilled') {
      queryClient.setQueryData(
        [['users', 'getOnboardingStatus'], { input: undefined, type: 'query' }],
        onboardingStatus.value
      );
    }
  } catch (error) {
    // If there's an error, the client will handle it
    console.debug('Could not prefetch dashboard data:', error);
  }
  
  return dehydrate(queryClient);
}
