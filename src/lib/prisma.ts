import "server-only"

import { PrismaClient } from '@/app/generated';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = global as unknown as {
    prisma: PrismaClient;
}

// pg defaults drop idle connections after 10s, which forces a new TCP+TLS+auth
// handshake on most requests. The Neon pooler sits in front, so a small pool is enough.
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
