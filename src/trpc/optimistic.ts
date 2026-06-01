"use client"

import { useQueryClient, type QueryKey } from "@tanstack/react-query"

/**
 * Shared optimistic-update helpers for React Query caches.
 *
 * These standardize the cancel → snapshot → mutate-cache → rollback-on-error →
 * settle-invalidate dance so individual mutation call sites stay a few lines.
 *
 * tRPC's query-key shape is `[[...path], { input, type: 'query' }]`. When using
 * the tRPC React hooks you can obtain the right key via
 * `trpc.<router>.<proc>.getQueryKey(input)` and pass it here as `listKey`.
 *
 * Two surfaces use these:
 * - Web pages whose list data comes from a client `useQuery` (cache-backed).
 * - The browser extension (Phase 2), once it adopts React Query.
 *
 * NOTE: Web pages whose list is server-rendered and passed as props do NOT use
 * these — they use React's `useOptimistic` instead, because their data never
 * enters the React Query cache.
 */

type Recipe<TData> = (previous: TData | undefined) => TData | undefined

/**
 * Returns helpers bound to the current QueryClient for building optimistic
 * `useMutation` option objects.
 */
export function useOptimisticCache() {
  const queryClient = useQueryClient()

  /**
   * Build the `onMutate`/`onError`/`onSettled` trio for an optimistic mutation
   * against a single cached list/query identified by `listKey`.
   *
   * @param listKey  The React Query key of the list to update.
   * @param apply    Pure recipe that returns the next cache value given the prev.
   */
  function optimisticOptions<TData>(listKey: QueryKey, apply: Recipe<TData>) {
    return {
      onMutate: async () => {
        // Stop in-flight refetches from clobbering our optimistic write.
        await queryClient.cancelQueries({ queryKey: listKey })
        const previous = queryClient.getQueryData<TData>(listKey)
        queryClient.setQueryData<TData>(listKey, (prev) => apply(prev))
        return { previous }
      },
      onError: (_err: unknown, _vars: unknown, context: unknown) => {
        const ctx = context as { previous?: TData } | undefined
        if (ctx && "previous" in ctx) {
          queryClient.setQueryData<TData>(listKey, ctx.previous)
        }
      },
      onSettled: () => {
        // Reconcile with the server regardless of success/failure.
        queryClient.invalidateQueries({ queryKey: listKey })
      },
    }
  }

  return { queryClient, optimisticOptions }
}

/**
 * Recipe: insert an item at the front of an array-shaped cache.
 */
export function insertItem<T>(item: T): Recipe<T[]> {
  return (prev) => [item, ...(prev ?? [])]
}

/**
 * Recipe: replace an item matched by `id` (uses an `id` field by default).
 */
export function updateItemById<T extends { id: string }>(
  id: string,
  patch: Partial<T>
): Recipe<T[]> {
  return (prev) => (prev ?? []).map((it) => (it.id === id ? { ...it, ...patch } : it))
}

/**
 * Recipe: remove items whose `id` is in `ids`.
 */
export function removeItemsById<T extends { id: string }>(ids: string[]): Recipe<T[]> {
  const set = new Set(ids)
  return (prev) => (prev ?? []).filter((it) => !set.has(it.id))
}
