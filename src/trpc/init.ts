import { initTRPC, TRPCError } from '@trpc/server';
import { cache } from 'react';
import superjson from 'superjson';
import { headers } from 'next/headers';
import { getSession } from "@/lib/session";
import { getUserPermissions, getUserRoleName } from "@/lib/permissions";
import { generateCorrelationId, logError, formatErrorWithCorrelationId } from "@/lib/correlation-id-util";

export type Context = {
  userId: string;
  userRole: string | null;
  permissions: string[];
  subdomain: string | null;
  companyId: string | null;
  userTeams: string[];
  sessionToken?: string; // Add session token to context for client-side decryption
  correlationId: string; // Add correlation ID to context
};

export const createTRPCContext = cache(async (): Promise<Context> => {
  /**
   * @see: https://trpc.io/docs/server/context
   */
  const headersList = await headers();
  
  // Get subdomain from header (set by middleware) or detect from host
  let subdomain = headersList.get("x-subdomain") || null;
  
  // If middleware didn't set subdomain (e.g., API routes), detect it from host
  if (!subdomain) {
    const host = headersList.get("host") || headersList.get("x-forwarded-host") || "";
    const hostWithoutPort = host.split(":")[0];
    const parts = hostWithoutPort.split(".");
    
    // Extract subdomain for: subdomain.localhost or subdomain.domain.tld
    if (parts.length >= 3 || (parts.length === 2 && parts[1].includes("localhost"))) {
      const detectedSubdomain = parts[0];
      if (detectedSubdomain && detectedSubdomain !== "www" && detectedSubdomain !== "localhost") {
        subdomain = detectedSubdomain;
      }
    }
  }
  
  // Check for session token in header (for extensions)
  const sessionTokenFromHeader = headersList.get("x-session-token");
  
  let session = await getSession();
  
  // If we have a token in header but no session from cookie, try to verify the token
  if (sessionTokenFromHeader && (!session?.isLoggedIn || !session.userId)) {
    try {
      const { jwtVerify } = await import("jose");
      const SESSION_SECRET = process.env.SESSION_SECRET || "default-secret-change-in-production";
      const secret = new TextEncoder().encode(SESSION_SECRET);
      const { payload } = await jwtVerify(sessionTokenFromHeader, secret);
      
      // Verify session exists in database
      const prisma = (await import("@/lib/prisma")).default;
      const dbSession = await prisma.session.findUnique({
        where: { sessionToken: sessionTokenFromHeader },
        select: { id: true, expires: true, userId: true },
      });

      if (dbSession && new Date(dbSession.expires) > new Date()) {
        // Valid token - create session data
        session = {
          userId: dbSession.userId,
          email: (payload.email as string) || "",
          isLoggedIn: true,
          mfaVerified: (payload.mfaVerified as boolean) ?? true,
          mfaSetupRequired: (payload.mfaSetupRequired as boolean) ?? false,
          mfaRequired: (payload.mfaRequired as boolean) ?? false,
        };
      }
    } catch (error) {
      // Invalid token - session remains invalid
      console.error("Invalid session token from header:", error);
    }
  }
  
  const userId = session.userId;
  
  // If no session or no userId, return empty context
  if (!session?.isLoggedIn || !userId) {
    return {
      userId: "",
      userRole: null,
      permissions: [],
      subdomain,
      companyId: null,
      userTeams: [],
    };
  }
  
  // Get user role and permissions with concurrency control
  // If user doesn't exist in database, these will return null/empty
  const { limit } = await import("@/lib/p-limit");
  
  // Fetch user info once, with company and teams
  const userWithTeams = await limit(() =>
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        companyId: true,
        teamMembers: {
          select: { teamId: true },
        },
      },
    })
  );

  const companyId = userWithTeams?.companyId || null;
  const userTeams = userWithTeams?.teamMembers?.map((tm) => tm.teamId) || [];

  const [userRole, permissions] = await Promise.all([
    limit(() => getUserRoleName(userId).catch(() => null)),
    limit(() => getUserPermissions(userId).catch(() => [])),
  ]);
  
  // Get session token for client-side decryption
  // Try header first (for extensions), then cookie (for web)
  let sessionToken = sessionTokenFromHeader;
  if (!sessionToken) {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    sessionToken = cookieStore.get("session")?.value || undefined;
  }
  
  // Generate correlation ID for request tracking
  const correlationId = generateCorrelationId();
  
  return { 
    userId,
    userRole,
    permissions,
    subdomain,
    companyId,
    userTeams,
    sessionToken,
    correlationId,
  };
});
// Avoid exporting the entire t-object
// since it's not very descriptive.
// For instance, the use of a t variable
// is common in i18n libraries.
const t = initTRPC.context<Context>().create({
  /**
   * @see https://trpc.io/docs/server/data-transformers
   */
  transformer: superjson,
});
// Base router and procedure helpers
export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

/**
 * Middleware to add correlation ID to all errors
 */
const errorHandlingMiddleware = t.middleware(async ({ ctx, next }) => {
  try {
    return await next({ ctx });
  } catch (error) {
    // Log error with correlation ID
    logError(ctx.correlationId, error, {
      userId: ctx.userId,
      path: ctx,
    });

    // If it's a TRPCError, enhance it with correlation ID
    if (error instanceof TRPCError) {
      throw new TRPCError({
        ...error,
        message: formatErrorWithCorrelationId(error.message, ctx.correlationId),
        cause: {
          ...((error.cause as Record<string, unknown>) || {}),
          correlationId: ctx.correlationId,
        },
      });
    }

    // For other errors, wrap them in a TRPCError with correlation ID
    const message = error instanceof Error ? error.message : "An unexpected error occurred";
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: formatErrorWithCorrelationId(message, ctx.correlationId),
      cause: {
        correlationId: ctx.correlationId,
        originalError: error,
      },
    });
  }
});

export const baseProcedure = t.procedure.use(errorHandlingMiddleware);

/**
 * Middleware to check if user has required permission(s)
 */
export const requirePermission = (permissionKey: string | string[]) => {
  return t.middleware(async ({ ctx, next }) => {
    const requiredPermissions = Array.isArray(permissionKey) 
      ? permissionKey 
      : [permissionKey];
    
    const hasPermission = requiredPermissions.some(key => 
      ctx.permissions.includes(key)
    );
    
    if (!hasPermission) {
      const message = `You do not have permission to perform this action. Required: ${requiredPermissions.join(" or ")}`;
      throw new TRPCError({
        code: "FORBIDDEN",
        message: formatErrorWithCorrelationId(message, ctx.correlationId),
        cause: {
          correlationId: ctx.correlationId,
        },
      });
    }
    
    return next({ ctx });
  });
};

/**
 * Procedure that requires a specific permission
 */
export const protectedProcedure = (permissionKey: string | string[]) => {
  return baseProcedure.use(requirePermission(permissionKey));
};