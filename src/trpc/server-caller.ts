import 'server-only';
import { cache } from 'react';
import { appRouter } from './routers/_app';
import { createCallerFactory, createTRPCContext } from './init';

const createCaller = createCallerFactory(appRouter);

/**
 * Get a server-side tRPC caller
 * This is cached per request using React's cache function
 */
export const serverTrpc = cache(async () => {
  const context = await createTRPCContext();
  return createCaller(context);
});

/**
 * Result of `auth.getCurrentUser` for the current request.
 * Layout prefetch, route guards and pages all go through this, so the
 * procedure runs once per request however many of them ask.
 * Rejects (like the procedure) when the visitor is not authenticated.
 */
export const getCurrentUserData = cache(async () => {
  const trpc = await serverTrpc();
  return trpc.auth.getCurrentUser();
});
