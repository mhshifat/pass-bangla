import "server-only"

import { PrismaClient } from '@/app/generated';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = global as unknown as {
    prisma: PrismaClient;
}

// pg defaults drop idle connections after 10s, which forces a new TCP+TLS+auth
// handshake on most requests. pgnest's PgBouncer (:6432) sits in front, so a small pool is enough.
// The DB is in Manchester (UK); keep vercel.json "regions" at lhr1 next to it -- every
// query is a network round-trip, ~170ms from sin1 vs a few ms from lhr1.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 5_000,
})

const prisma = globalForPrisma.prisma || new PrismaClient({
  adapter,
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export { prisma }
export default prisma
