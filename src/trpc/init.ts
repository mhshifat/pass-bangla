import { initTRPC, TRPCError } from '@trpc/server';
import { cache } from 'react';
import superjson from 'superjson';
import { headers } from 'next/headers';
import { getSessionWithUser, verifySessionToken, findSessionUser } from "@/lib/session";
import type { SessionData, SessionUser } from "@/lib/session";
import { getCachedRolePermissions } from "@/lib/permissions";
import { rememberUserCompany } from "@/lib/user-company";
import { generateCorrelationId, logError, formatErrorWithCorrelationId, sanitizeClientErrorMessage } from "@/lib/correlation-id-util";

export type Context = {
  userId: string;
  userRole: string | null;
  permissions: string[];
  subdomain: string | null;
  companyId: string | null;
  userTeams: string[];
  sessionToken: string | null; // Session token for client-side decryption
  correlationId: string; // Correlation ID for request tracking
  mfaVerified: boolean; // Whether MFA has been completed for this session
  mfaRequired: boolean; // Whether MFA is required but not yet satisfied
  // The validated session and the acting user, already loaded for this request.
  // Procedures should read these instead of calling getSession() or re-querying
  // the user. Both are null when the request is not authenticated; `user` is
  // also null if the session's user no longer exists.
  session: SessionData | null;
  user: SessionUser | null;
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
  
  // One query validates the session row and loads the acting user with it
  const cookieAuth = await getSessionWithUser();
  let session = cookieAuth.session;
  let user = cookieAuth.user;
  let userLoaded = cookieAuth.userLoaded;

  // If we have a token in header but no session from cookie, try to verify the token
  if (sessionTokenFromHeader && (!session?.isLoggedIn || !session.userId)) {
    try {
      // Verifies the JWT and that the session exists in the database
      const headerAuth = await verifySessionToken(sessionTokenFromHeader);

      if (headerAuth) {
        // Valid token - create session data
        session = headerAuth.session;
        user = headerAuth.user;
        userLoaded = true;
      }
    } catch (error) {
      // Invalid token - session remains invalid
      console.error("Invalid session token from header:", error);
    }
  }
  
  const userId = session.userId;
  
  // If no session or no userId, return empty context
  if (!session?.isLoggedIn || !userId) {
    const correlationId = generateCorrelationId();
    return {
      userId: "",
      userRole: null,
      permissions: [],
      subdomain,
      companyId: null,
      userTeams: [],
      sessionToken: null,
      correlationId,
      mfaVerified: false,
      mfaRequired: false,
      session: null,
      user: null,
    };
  }

  // Get user role and permissions
  // If user doesn't exist in database, these will return null/empty
  // The user normally arrives with the session; it is only missing when the
  // session check fell back to JWT-only, so look it up separately then.
  if (!userLoaded) {
    user = await findSessionUser(userId);
  }

  const companyId = user?.companyId || null;
  const userRole = user?.role || null;
  // Later lookups in this request (audit logs etc.) reuse this instead of re-querying
  if (user) rememberUserCompany(userId, companyId);
  const userTeams = user?.teamIds || [];

  // Fetch role + permissions with a small retry. A TRANSIENT DB failure (Neon
  // pooler cold-start / dropped connection) must NOT be silently turned into an
  // empty permission set — that surfaces as a bogus 403 "insufficient
  // permissions" on protected procedures even for fully-authorized users.
  // We retry, and if it ultimately throws we LOG it loudly (was previously
  // swallowed by `.catch(() => [])`).
  const withRetry = async <T,>(
    label: string,
    fn: () => Promise<T>,
    fallback: T
  ): Promise<T> => {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        // brief backoff before retrying a transient DB error
        await new Promise((r) => setTimeout(r, attempt * 60));
      }
    }
    console.error(
      `[ctx] ${label} failed after retries for user ${userId}:`,
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    );
    return fallback;
  };

  // Role → permission keys are cached in memory for 60s per role|companyId
  // (see getCachedRolePermissions for the trade-off), so a warm instance
  // builds the whole context with the single session query above.
  const permissions = userRole
    ? await withRetry("getRolePermissions", () => getCachedRolePermissions(userRole, companyId), [] as string[])
    : [];

  // Distinguish "genuinely has no permissions" from a masked failure so it's
  // visible in logs when a normally-privileged user resolves to zero perms.
  if (permissions.length === 0) {
    console.warn(
      `[ctx] user ${userId} resolved to ZERO permissions (role=${userRole ?? "none"}). ` +
        `If this user should be privileged, the role→permission lookup returned empty or failed.`
    );
  }
  
  // Get session token for client-side decryption
  // Try header first (for extensions), then cookie (for web)
  const sessionToken: string | null = sessionTokenFromHeader || cookieAuth.token || null;
  
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
    mfaVerified: (session.mfaVerified as boolean) ?? true,
    mfaRequired: (session.mfaRequired as boolean) ?? false,
    session,
    user,
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
const errorHandlingMiddleware = t.middleware(async ({ ctx, next, path }) => {
  try {
    return await next({ ctx });
  } catch (error) {
    // Log error with correlation ID. Never log the context itself: it holds the
    // session token and the user's personal details.
    logError(ctx.correlationId, error, {
      userId: ctx.userId,
      path,
    });

    // If it's a TRPCError, enhance it with correlation ID
    if (error instanceof TRPCError) {
      const safeMessage = sanitizeClientErrorMessage(
        error.message,
        "Something went wrong. Please try again."
      );
      throw new TRPCError({
        ...error,
        message: formatErrorWithCorrelationId(safeMessage, ctx.correlationId),
        cause: {
          ...((error.cause as unknown as Record<string, unknown>) || {}),
          correlationId: ctx.correlationId,
        },
      });
    }

    // For other errors, wrap them in a TRPCError with correlation ID
    const rawMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    const message = sanitizeClientErrorMessage(
      rawMessage,
      "Something went wrong. Please try again."
    );
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
    // No authenticated user = the session is missing or expired. Return a clean
    // UNAUTHORIZED (not "insufficient permissions"): the user IS authorized, their
    // session just ended. Clients treat this as "sign in again" and can transition
    // to the login screen smoothly instead of flashing a scary permissions error.
    if (!ctx.userId) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: formatErrorWithCorrelationId(
          "Your session has expired. Please sign in again.",
          ctx.correlationId
        ),
        cause: { correlationId: ctx.correlationId, sessionExpired: true },
      });
    }

    // Enforce MFA server-side: a session that still requires MFA (correct password
    // entered but second factor not yet verified) must NOT reach protected data.
    // The client-side redirect to /mfa-verify is not a security control on its own.
    if (ctx.mfaRequired && !ctx.mfaVerified) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: formatErrorWithCorrelationId(
          "Multi-factor authentication is required. Please complete MFA verification.",
          ctx.correlationId
        ),
        cause: { correlationId: ctx.correlationId, mfaRequired: true },
      });
    }

    const requiredPermissions = Array.isArray(permissionKey)
      ? permissionKey
      : [permissionKey];

    const hasPermission = requiredPermissions.some(key =>
      ctx.permissions.includes(key)
    );
    
    if (!hasPermission) {
      // Import helper to format permission names
      const { formatPermissionList } = await import("@/lib/permission-helpers");
      const permissionList = formatPermissionList(requiredPermissions);
      const message = `Insufficient permissions. This action requires: ${permissionList}. Please contact your administrator to request access.`;
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