import { createTRPCRouter } from "../init";
import { authRouter } from "@/modules/auth/server/procedures";
import { usersRouter } from "@/modules/users/server/procedures"
import { settingsRouter } from "@/modules/settings/server/procedures"
import { rolesRouter } from "@/modules/roles/server/procedures"
import { teamsRouter } from "@/modules/teams/server/procedures"
import { foldersRouter } from "@/modules/folders/server/procedures"
import { passwordsRouter } from "@/modules/passwords/server/procedures"
import { passwordRotationRouter } from "@/modules/passwords/server/rotation-procedures"
import { dashboardRouter } from "@/modules/dashboard/server/procedures"
import { auditLogsRouter } from "@/modules/audit-logs/server/procedures"
import { reportsRouter } from "@/modules/reports/server/procedures"
import { insightsRouter } from "@/modules/insights/server/procedures"
import { quickActionsRouter } from "@/modules/quick-actions/server/procedures"

import { healthRouter } from "@/modules/health/server/procedures"

export const appRouter = createTRPCRouter({
  health: healthRouter,
  auth: authRouter,
  users: usersRouter,
  settings: settingsRouter,
  roles: rolesRouter,
  teams: teamsRouter,
  folders: foldersRouter,
  passwords: passwordsRouter,
  passwordRotation: passwordRotationRouter,
  dashboard: dashboardRouter,
  auditLogs: auditLogsRouter,
  reports: reportsRouter,
  insights: insightsRouter,
  quickActions: quickActionsRouter,
});
// export type definition of API
export type AppRouter = typeof appRouter;