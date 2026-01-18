import { initTRPC, TRPCError } from '@trpc/server';
import { cache } from 'react';
import superjson from 'superjson';
import { headers } from 'next/headers';
import { getSession } from "@/lib/session";
import { getUserPermissions, getUserRoleName } from "@/lib/permissions";

export type Context = {
  userId: string;
  userRole: string | null;
  permissions: string[];
  subdomain: string | null;
  sessionToken?: string; // Add session token to context for client-side decryption
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
    };
  }
  
  // Get user role and permissions
  // If user doesn't exist in database, these will return null/empty
  const [userRole, permissions] = await Promise.all([
    getUserRoleName(userId).catch(() => null),
    getUserPermissions(userId).catch(() => []),
  ]);
  
  // Get session token for client-side decryption
  // Try header first (for extensions), then cookie (for web)
  let sessionToken = sessionTokenFromHeader;
  if (!sessionToken) {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    sessionToken = cookieStore.get("session")?.value || undefined;
  }
  
  return { 
    userId,
    userRole,
    permissions,
    subdomain,
    sessionToken,
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
export const baseProcedure = t.procedure;

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
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `You do not have permission to perform this action. Required: ${requiredPermissions.join(" or ")}`,
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