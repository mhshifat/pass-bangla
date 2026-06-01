import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from '@tanstack/react-query';
import superjson from 'superjson';
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data is considered fresh for 5 minutes, so navigating between pages
        // does not refetch on every mount. Fast-changing queries (dashboard
        // stats, audit logs) override this with a shorter staleTime at the call
        // site.
        staleTime: 5 * 60 * 1000,
        // Keep unused data cached for 10 minutes so back-navigation is instant.
        gcTime: 10 * 60 * 1000,
        // Avoid refetch thrashing: the user has almost certainly not gone stale
        // just by switching tabs or briefly losing connection.
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
      },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  });
}