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

interface PrefetchFavoritesInput {
  page?: number;
  pageSize?: number;
  search?: string;
}

/**
 * Prefetch favorites page data on the server
 * This prefetches favorites and related data to avoid exposing sensitive info in client-side API calls
 * 
 * @example
 * ```tsx
 * export default async function FavoritesPage({ searchParams }) {
 *   const params = await searchParams
 *   const dehydratedState = await prefetchFavoritesData({
 *     page: Number(params.page) || 1,
 *     pageSize: 20,
 *     search: params.search || undefined,
 *   })
 *   
 *   return (
 *     <HydrationBoundary state={dehydratedState}>
 *       <FavoritesPageClient />
 *     </HydrationBoundary>
 *   )
 * }
 * ```
 */
export async function prefetchFavoritesData(input: PrefetchFavoritesInput = {}) {
  const queryClient = makeQueryClient();
  const trpc = await serverTrpc();
  
  const { page = 1, pageSize = 20, search } = input;
  // tRPC serializes undefined as null in JSON, so we need to match that for cache key
  const favoritesInput = { page, pageSize, search: search || null };
  
  try {
    // Prefetch favorites, export filters, rotation reminders, and user preferences in parallel
    // These are all queries made by FavoritesPageClient and its child components (PasswordsTable)
    const [
      favorites,
      exportFilters,
      reminders365,
      onboardingStatus,
      accessibilityPrefs
    ] = await Promise.allSettled([
      trpc.passwords.getFavorites(favoritesInput),
      trpc.passwords.getExportFilters(),
      trpc.passwordRotation.getReminders({ daysAhead: 365 }),
      trpc.users.getOnboardingStatus(),
      trpc.users.getAccessibilityPreferences(),
    ]);

    // Set each query data in the cache with the correct tRPC query key format
    // The input in the cache key must match EXACTLY what the client query will use
    if (favorites.status === 'fulfilled') {
      queryClient.setQueryData(
        [['passwords', 'getFavorites'], { input: favoritesInput, type: 'query' }],
        favorites.value
      );
    }

    if (exportFilters.status === 'fulfilled') {
      queryClient.setQueryData(
        [['passwords', 'getExportFilters'], { input: undefined, type: 'query' }],
        exportFilters.value
      );
    }

    if (reminders365.status === 'fulfilled') {
      queryClient.setQueryData(
        [['passwordRotation', 'getReminders'], { input: { daysAhead: 365 }, type: 'query' }],
        reminders365.value
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
    // If there's an error, the client will handle it
    console.debug('Could not prefetch favorites data:', error);
  }
  
  return dehydrate(queryClient);
}

/**
 * Prefetch tags page data on the server
 */
export async function prefetchTagsData() {
  const queryClient = makeQueryClient();
  const trpc = await serverTrpc();
  
  try {
    const [analytics, exportFilters, onboardingStatus, accessibilityPrefs] = await Promise.allSettled([
      trpc.passwords.tagAnalytics(),
      trpc.passwords.getExportFilters(),
      trpc.users.getOnboardingStatus(),
      trpc.users.getAccessibilityPreferences(),
    ]);

    if (analytics.status === 'fulfilled') {
      queryClient.setQueryData(
        [['passwords', 'tagAnalytics'], { input: undefined, type: 'query' }],
        analytics.value
      );
    }

    if (exportFilters.status === 'fulfilled') {
      queryClient.setQueryData(
        [['passwords', 'getExportFilters'], { input: undefined, type: 'query' }],
        exportFilters.value
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
    console.debug('Could not prefetch tags data:', error);
  }
  
  return dehydrate(queryClient);
}

/**
 * Prefetch templates page data on the server
 */
export async function prefetchTemplatesData() {
  const queryClient = makeQueryClient();
  const trpc = await serverTrpc();
  
  try {
    const [templates, onboardingStatus, accessibilityPrefs] = await Promise.allSettled([
      trpc.passwords.listTemplates({ page: 1, pageSize: 100 }),
      trpc.users.getOnboardingStatus(),
      trpc.users.getAccessibilityPreferences(),
    ]);

    if (templates.status === 'fulfilled') {
      queryClient.setQueryData(
        [['passwords', 'listTemplates'], { input: { page: 1, pageSize: 100 }, type: 'query' }],
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
    console.debug('Could not prefetch templates data:', error);
  }
  
  return dehydrate(queryClient);
}

/**
 * Prefetch duplicates page data on the server
 */
export async function prefetchDuplicatesData() {
  const queryClient = makeQueryClient();
  const trpc = await serverTrpc();
  
  try {
    const [duplicates, reused, similar, onboardingStatus, accessibilityPrefs] = await Promise.allSettled([
      trpc.passwords.findDuplicates({}),
      trpc.passwords.findReused({}),
      trpc.passwords.findSimilar({ threshold: 0.8 }),
      trpc.users.getOnboardingStatus(),
      trpc.users.getAccessibilityPreferences(),
    ]);

    if (duplicates.status === 'fulfilled') {
      queryClient.setQueryData(
        [['passwords', 'findDuplicates'], { input: {}, type: 'query' }],
        duplicates.value
      );
    }

    if (reused.status === 'fulfilled') {
      queryClient.setQueryData(
        [['passwords', 'findReused'], { input: {}, type: 'query' }],
        reused.value
      );
    }

    if (similar.status === 'fulfilled') {
      queryClient.setQueryData(
        [['passwords', 'findSimilar'], { input: { threshold: 0.8 }, type: 'query' }],
        similar.value
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
    console.debug('Could not prefetch duplicates data:', error);
  }
  
  return dehydrate(queryClient);
}

/**
 * Prefetch breaches page data on the server
 */
export async function prefetchBreachesData() {
  const queryClient = makeQueryClient();
  const trpc = await serverTrpc();
  
  try {
    const [breachHistory, onboardingStatus, accessibilityPrefs] = await Promise.allSettled([
      trpc.passwords.getBreachHistory({ includeResolved: false }),
      trpc.users.getOnboardingStatus(),
      trpc.users.getAccessibilityPreferences(),
    ]);

    if (breachHistory.status === 'fulfilled') {
      queryClient.setQueryData(
        [['passwords', 'getBreachHistory'], { input: { includeResolved: false }, type: 'query' }],
        breachHistory.value
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
    console.debug('Could not prefetch breaches data:', error);
  }
  
  return dehydrate(queryClient);
}

/**
 * Prefetch shares page data on the server (team shares + temporary shares + stats).
 */
export async function prefetchSharesData() {
  const queryClient = makeQueryClient();
  const trpc = await serverTrpc();

  const tempInput = { status: "all" as const, page: 1, pageSize: 20 };
  const teamInput = { status: "all" as const, page: 1, pageSize: 20 };

  try {
    const [tempShares, teamShares, stats, onboardingStatus, accessibilityPrefs] =
      await Promise.allSettled([
        trpc.passwords.listTemporaryShares(tempInput),
        trpc.passwords.listMyTeamPasswordShares(teamInput),
        trpc.passwords.getShareStats(),
        trpc.users.getOnboardingStatus(),
        trpc.users.getAccessibilityPreferences(),
      ]);

    if (tempShares.status === "fulfilled") {
      queryClient.setQueryData(
        [["passwords", "listTemporaryShares"], { input: tempInput, type: "query" }],
        tempShares.value
      );
    }

    if (teamShares.status === "fulfilled") {
      queryClient.setQueryData(
        [["passwords", "listMyTeamPasswordShares"], { input: teamInput, type: "query" }],
        teamShares.value
      );
    }

    if (stats.status === "fulfilled") {
      queryClient.setQueryData(
        [["passwords", "getShareStats"], { input: undefined, type: "query" }],
        stats.value
      );
    }

    if (onboardingStatus.status === "fulfilled") {
      queryClient.setQueryData(
        [["users", "getOnboardingStatus"], { input: undefined, type: "query" }],
        onboardingStatus.value
      );
    }

    if (accessibilityPrefs.status === "fulfilled") {
      queryClient.setQueryData(
        [["users", "getAccessibilityPreferences"], { input: undefined, type: "query" }],
        accessibilityPrefs.value
      );
    }
  } catch (error) {
    console.debug("Could not prefetch shares data:", error);
  }

  return dehydrate(queryClient);
}

/**
 * Prefetch rotation page data on the server
 */
export async function prefetchRotationData() {
  const queryClient = makeQueryClient();
  const trpc = await serverTrpc();
  
  try {
    const [policies, reminders, history, onboardingStatus, accessibilityPrefs] = await Promise.allSettled([
      trpc.passwordRotation.listPolicies(),
      trpc.passwordRotation.getReminders({ daysAhead: 30 }),
      trpc.passwordRotation.getRotationHistory({ page: 1, pageSize: 20 }),
      trpc.users.getOnboardingStatus(),
      trpc.users.getAccessibilityPreferences(),
    ]);

    if (policies.status === 'fulfilled') {
      queryClient.setQueryData(
        [['passwordRotation', 'listPolicies'], { input: undefined, type: 'query' }],
        policies.value
      );
    }

    if (reminders.status === 'fulfilled') {
      queryClient.setQueryData(
        [['passwordRotation', 'getReminders'], { input: { daysAhead: 30 }, type: 'query' }],
        reminders.value
      );
    }

    if (history.status === 'fulfilled') {
      queryClient.setQueryData(
        [['passwordRotation', 'getRotationHistory'], { input: { page: 1, pageSize: 20 }, type: 'query' }],
        history.value
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
    console.debug('Could not prefetch rotation data:', error);
  }
  
  return dehydrate(queryClient);
}
