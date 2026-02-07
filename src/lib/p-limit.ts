// p-limit.ts
import pLimit from 'p-limit';

// Set concurrency as needed (default: 5)
export const limit = pLimit(5);