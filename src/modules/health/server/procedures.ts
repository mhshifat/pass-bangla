import prisma from "@/lib/prisma"
import { createTRPCRouter, baseProcedure } from "@/trpc/init"

export const healthRouter = createTRPCRouter({
  /**
   * Public no-op that touches the database. Called by the client keep-warm
   * heartbeat so the serverless function and the (auto-suspending) database
   * are already awake when the user does something real.
   */
  ping: baseProcedure.query(async () => {
    await prisma.$queryRaw`SELECT 1`
    return { ok: true }
  }),
})
