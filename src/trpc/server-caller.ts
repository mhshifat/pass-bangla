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
