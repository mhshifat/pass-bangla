import prisma from "@/lib/prisma";
import { baseProcedure, createTRPCRouter, protectedProcedure } from "@/trpc/init";
import z from "zod";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { createSession, destroySession, getSession } from "@/lib/session";
import { TRPCError } from "@trpc/server";
import { decrypt } from "@/lib/crypto";
import { getRequestMetadata } from "@/lib/audit-log";
import { headers, cookies } from "next/headers";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@/lib/webauthn";

const globalWithPasskeys = globalThis as typeof globalThis & {
    passkeyRegistrationChallenges?: Map<string, string>
    passkeyAuthenticationChallenges?: Map<string, { challenge: string; userId: string }>
}

type WebAuthnDeviceType = "singleDevice" | "multiDevice" | null

function normalizeWebAuthnDeviceType(value: string | null): WebAuthnDeviceType {
    if (value === "singleDevice" || value === "multiDevice") {
        return value
    }
    return null
}

/**
 * Ensure system roles and permissions exist in the database
 */
async function ensureSystemRolesExist() {
  // Always ensure all default permissions exist (create missing ones)
  const defaultPermissions = [
    { key: "user.create", name: "Create Users", description: "Create new user accounts", category: "User Management" },
    { key: "user.edit", name: "Edit Users", description: "Modify user information", category: "User Management" },
    { key: "user.delete", name: "Delete Users", description: "Remove user accounts", category: "User Management" },
    { key: "user.view", name: "View Users", description: "View user information", category: "User Management" },
    { key: "password.create", name: "Create Passwords", description: "Create new password entries", category: "Password Management" },
    { key: "password.edit", name: "Edit Passwords", description: "Modify password entries", category: "Password Management" },
    { key: "password.delete", name: "Delete Passwords", description: "Remove password entries", category: "Password Management" },
    { key: "password.view", name: "View Passwords", description: "View password entries", category: "Password Management" },
    { key: "password.share", name: "Share Passwords", description: "Share passwords with others", category: "Password Management" },
    { key: "team.create", name: "Create Teams", description: "Create new teams", category: "Team Management" },
    { key: "team.edit", name: "Edit Teams", description: "Modify team settings", category: "Team Management" },
    { key: "team.delete", name: "Delete Teams", description: "Remove teams", category: "Team Management" },
    { key: "team.view", name: "View Teams", description: "View team information", category: "Team Management" },
    { key: "settings.view", name: "View Settings", description: "View system settings", category: "System Settings" },
    { key: "settings.edit", name: "Edit Settings", description: "Modify system settings", category: "System Settings" },
    { key: "audit.view", name: "View Audit Logs", description: "Access audit logs", category: "System Settings" },
    { key: "role.manage", name: "Manage Roles", description: "Create and edit roles", category: "System Settings" },
    { key: "report.view", name: "View Reports", description: "View and access reports", category: "Reports" },
    { key: "report.create", name: "Create Reports", description: "Create and generate reports", category: "Reports" },
    { key: "report.update", name: "Update Reports", description: "Modify report configurations", category: "Reports" },
    { key: "report.delete", name: "Delete Reports", description: "Remove reports", category: "Reports" },
  ];

  // Create missing permissions (skipDuplicates ensures existing ones aren't recreated)
  await prisma.permission.createMany({
    data: defaultPermissions,
    skipDuplicates: true,
  });

  // Always ensure all system roles exist with their permissions
  // This ensures all 5 system roles are created, not just the one being assigned
  await ensureAllSystemRoles();
}

/**
 * Ensure all system roles exist with their permissions
 */
async function ensureAllSystemRoles() {
  // Get all permissions
  const allPermissions = await prisma.permission.findMany();
  const permissionMap = new Map(allPermissions.map((p) => [p.key, p.id]));

  // Define all system roles with their permissions
  const systemRoles = [
    {
      name: "SUPER_ADMIN",
      description: "Super Administrator with ultimate system control - can manage roles and system settings",
      permissions: [
        "user.create", "user.edit", "user.delete", "user.view",
        "password.create", "password.edit", "password.delete", "password.view", "password.share",
        "team.create", "team.edit", "team.delete", "team.view",
        "settings.view", "settings.edit", "audit.view", "role.manage",
        "report.view", "report.create", "report.update", "report.delete",
      ],
    },
    {
      name: "ADMIN",
      description: "Administrator with elevated permissions - can manage users and content, but cannot manage roles or edit system settings",
      permissions: [
        "user.create", "user.edit", "user.delete", "user.view",
        "password.create", "password.edit", "password.delete", "password.view", "password.share",
        "team.create", "team.edit", "team.delete", "team.view",
        "settings.view", "audit.view",
        "report.view", "report.create",
      ],
    },
    {
      name: "MANAGER",
      description: "Manager with management permissions",
      permissions: [
        "user.view", "user.edit",
        "password.create", "password.edit", "password.delete", "password.view", "password.share",
        "team.create", "team.edit", "team.delete", "team.view",
        "settings.view", "audit.view",
        "report.view", "report.create",
      ],
    },
    {
      name: "USER",
      description: "Standard user with basic permissions",
      permissions: [
        "user.view",
        "password.create", "password.edit", "password.delete", "password.view", "password.share",
        "team.view",
      ],
    },
    {
      name: "AUDITOR",
      description: "Auditor with read-only access to audit logs",
      permissions: [
        "user.view",
        "password.view",
        "team.view",
        "settings.view",
        "audit.view",
        "report.view",
      ],
    },
  ];

  // Create or update each system role
  for (const roleData of systemRoles) {
    const { permissions, ...roleInfo } = roleData;

    // Create or update the role
    const role = await prisma.role.upsert({
      where: { name: roleInfo.name },
      update: {
        description: roleInfo.description,
        isSystem: true,
      },
      create: {
        name: roleInfo.name,
        description: roleInfo.description,
        isSystem: true,
        createdById: null,
      },
    });

    // Get permission IDs for this role
    const permissionIds = permissions
      .map((key) => permissionMap.get(key))
      .filter((id): id is string => id !== undefined);

    // Delete existing permissions for this role (to ensure correct permissions)
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id },
    });

    // Assign permissions
    if (permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
        skipDuplicates: true,
      });
    }
  }
}

/**
 * Create a system role with appropriate permissions
 */
async function createSystemRoleWithPermissions(roleName: string, isFirstUser: boolean) {
  // Get all permissions
  const allPermissions = await prisma.permission.findMany();
  const permissionMap = new Map(allPermissions.map((p) => [p.key, p.id]));

  // Define role permissions based on role name
  let rolePermissions: string[] = [];
  
  if (roleName === "SUPER_ADMIN" || (roleName === "ADMIN" && isFirstUser)) {
    // First user gets all permissions (SUPER_ADMIN level)
    rolePermissions = [
      "user.create", "user.edit", "user.delete", "user.view",
      "password.create", "password.edit", "password.delete", "password.view", "password.share",
      "team.create", "team.edit", "team.delete", "team.view",
      "settings.view", "settings.edit", "audit.view", "role.manage",
    ];
  } else if (roleName === "ADMIN") {
    rolePermissions = [
      "user.create", "user.edit", "user.delete", "user.view",
      "password.create", "password.edit", "password.delete", "password.view", "password.share",
      "team.create", "team.edit", "team.delete", "team.view",
      "settings.view", "audit.view",
    ];
  } else if (roleName === "USER") {
    rolePermissions = [
      "user.view",
      "password.create", "password.edit", "password.delete", "password.view", "password.share",
      "team.view",
    ];
  }

  // Create or update the role
  const role = await prisma.role.upsert({
    where: { name: roleName },
    update: {
      description: isFirstUser 
        ? "Super Administrator with ultimate system control - can manage roles and system settings"
        : roleName === "ADMIN"
        ? "Administrator with elevated permissions"
        : "Standard user with basic permissions",
      isSystem: true, // Ensure it stays as system role
    },
    create: {
      name: roleName,
      description: isFirstUser 
        ? "Super Administrator with ultimate system control - can manage roles and system settings"
        : roleName === "ADMIN"
        ? "Administrator with elevated permissions"
        : "Standard user with basic permissions",
      isSystem: true,
      createdById: null,
    },
  });

  // Delete existing permissions for this role (to ensure correct permissions are set)
  await prisma.rolePermission.deleteMany({
    where: { roleId: role.id },
  });

  // Assign permissions
  const permissionIds = rolePermissions
    .map((key) => permissionMap.get(key))
    .filter((id): id is string => id !== undefined);

  if (permissionIds.length > 0) {
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({
        roleId: role.id,
        permissionId,
      })),
      skipDuplicates: true,
    });
  }
}

export const authRouter = createTRPCRouter({
    register: baseProcedure
        .input(
            z.object({
                name: z.string().min(2, "Name must be at least 2 characters"),
                email: z.string().email("Invalid email address"),
                password: z.string().min(8, "Password must be at least 8 characters"),
                companyName: z.string().min(2, "Company name must be at least 2 characters").regex(/^[a-z0-9-]+$/, "Company name can only contain lowercase letters, numbers, and hyphens"),
            })
        )
        .mutation(async ({ input, ctx }) => {
            // Registration should only happen on main domain (no subdomain)
            if (ctx.subdomain) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Registration is only available on the main domain",
                });
            }

            // Validate and normalize subdomain from company name
            const subdomain = input.companyName.toLowerCase().trim().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
            
            if (subdomain.length < 2) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Company name must contain at least 2 valid characters",
                });
            }

            // Check if company/subdomain already exists
            const existingCompany = await prisma.company.findUnique({
                where: { subdomain },
            });

            if (existingCompany) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "A company with this name already exists. Please choose a different name.",
                });
            }

            // Check if user already exists globally (email should be unique per company, but we check globally for registration)
            // Note: After migration, email+companyId will be unique, but during registration we check globally
            const existingUser = await prisma.user.findFirst({
                where: { email: input.email },
            });

            if (existingUser) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "User with this email already exists",
                });
            }

            // Validate password against security policies
            const { validatePassword } = await import("@/lib/password-validation");
            const validation = await validatePassword(input.password);
            if (!validation.isValid) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: validation.errors.join(". "),
                });
            }

            // Hash password
            const hashedPassword = await hashPassword(input.password);

            // All users who register from /register get SUPER_ADMIN role
            // This gives them full control over their company and system
            // When admins create users from the admin panel, they can select the role
            const role = "SUPER_ADMIN";
            const isFirstUser = false; // Not used for role assignment, but kept for permission setup

            // Ensure ALL system roles and permissions exist (auto-seed if needed)
            // This creates all 5 system roles (SUPER_ADMIN, ADMIN, MANAGER, USER, AUDITOR)
            await ensureSystemRolesExist();

            // Verify the assigned role exists and has permissions (should exist after ensureSystemRolesExist)
            const roleExists = await prisma.role.findUnique({
                where: { name: role },
                include: {
                    permissions: true,
                },
            });

            // If the role still doesn't exist or has no permissions, create it
            // This is a fallback in case ensureSystemRolesExist didn't create it
            if (!roleExists || roleExists.permissions.length === 0) {
                await createSystemRoleWithPermissions(role, isFirstUser);
            }

            // Create company first
            const company = await prisma.company.create({
                data: {
                    name: input.companyName,
                    subdomain,
                },
            });

            // Create user associated with company (email not verified initially)
            // MFA is enabled by default for new registrations - user must set it up
            const user = await prisma.user.create({
                data: {
                    name: input.name,
                    email: input.email,
                    password: hashedPassword,
                    role,
                    companyId: company.id,
                    emailVerified: null, // Email not verified yet
                    mfaEnabled: true, // MFA enabled by default - user must set it up
                },
            });

            // Create and send verification email
            const { createVerificationToken, sendVerificationEmail } = await import("@/lib/email-verification");
            const token = await createVerificationToken(user.id, user.email);
            
            // Get base URL for verification link
            const headersList = await headers();
            const protocol = headersList.get("x-forwarded-proto") || "http";
            const host = headersList.get("host") || "localhost:3000";
            const baseUrl = `${protocol}://${host}`;
            
            await sendVerificationEmail(user.id, user.email, token, baseUrl);

            // Get request metadata (IP and user agent)
            const { ipAddress, userAgent } = getRequestMetadata(headersList);

            // Create session with device info
            // Set mfaSetupRequired to true for new registrations - user must set up MFA
            await createSession(user.id, user.email, {
                ipAddress,
                userAgent,
                mfaSetupRequired: true, // Require MFA setup for new registrations
                mfaVerified: false, // Not verified until MFA is set up
            });

            return {
                success: true,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                },
                company: {
                    id: company.id,
                    name: company.name,
                    subdomain: company.subdomain,
                },
            };
        }),
    login: baseProcedure
        .input(
            z.object({
                company: z.string().optional(),
                email: z.string().email("Invalid email address"),
                password: z.string().min(1, "Password is required"),
                captchaToken: z.string().optional(),
                captchaAnswer: z.number().optional(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            // Get request metadata (IP and user agent) - needed for threat detection
            const headersList = await headers();
            const { ipAddress, userAgent } = getRequestMetadata(headersList);

            // Get subdomain from context (set by middleware)
            const subdomain = ctx.subdomain

            // Find company by subdomain OR company name from input
            let company;
            
            if (subdomain) {
                // Login via subdomain (e.g., company.passbangla.com)
                company = await prisma.company.findUnique({
                    where: { subdomain },
                })
            } else if (input.company) {
                const normalizedCompany = input.company.trim()
                // Login via main domain with company name/subdomain
                company = await prisma.company.findFirst({
                    where: {
                        OR: [
                            { subdomain: normalizedCompany.toLowerCase() },
                            { name: { equals: normalizedCompany, mode: "insensitive" } },
                        ]
                    },
                })
            } else {
                // No subdomain and no company provided
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Please provide your company name to login",
                })
            }

            if (!company) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Company not found. Please check your company name and try again",
                })
            }

            // Get threat detection configuration
            const {
                getThreatDetectionConfig,
                checkRateLimit,
                checkBruteForce,
                shouldRequireCaptcha,
            } = await import("@/lib/threat-detection")
            const threatConfig = await getThreatDetectionConfig(company.id)

            // Check rate limiting (IP-based) if enabled
            if (threatConfig.enabled && threatConfig.rateLimiting.enabled && ipAddress) {
                const rateLimitCheck = await checkRateLimit(
                    ipAddress,
                    "IP",
                    "LOGIN",
                    threatConfig.rateLimiting.login,
                    company.id
                )

                if (rateLimitCheck.exceeded) {
                    throw new TRPCError({
                        code: "TOO_MANY_REQUESTS",
                        message: `Too many login attempts. Please try again after ${new Date(rateLimitCheck.resetAt).toLocaleTimeString()}.`,
                    })
                }
            }

            // Find user in this company
            const user = await prisma.user.findFirst({
                where: { 
                    email: input.email,
                    companyId: company.id,
                },
            })

            if (!user) {
                // Don't reveal if user exists (security best practice)
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Invalid email or password",
                })
            }

            // Check CAPTCHA requirement (for suspicious IPs) - after user is found
            if (threatConfig.enabled && threatConfig.captcha.enabled && ipAddress) {
                const requiresCaptcha = await shouldRequireCaptcha(
                    ipAddress,
                    "IP",
                    "LOGIN",
                    threatConfig.captcha,
                    company.id
                )
                if (requiresCaptcha) {
                    // Verify CAPTCHA if provided
                    if (input.captchaToken && input.captchaAnswer !== undefined) {
                        const { verifyCaptchaFromStore } = await import("@/lib/captcha")
                        const isValid = verifyCaptchaFromStore(input.captchaToken, input.captchaAnswer)
                        if (!isValid) {
                            throw new TRPCError({
                                code: "BAD_REQUEST",
                                message: "Invalid CAPTCHA answer. Please try again.",
                            })
                        }
                    } else {
                        // Generate new CAPTCHA challenge
                        const { generateCaptchaChallenge, storeCaptchaChallenge } = await import("@/lib/captcha")
                        const challenge = generateCaptchaChallenge()
                        storeCaptchaChallenge(challenge.token, challenge.answer)
                        throw new TRPCError({
                            code: "PRECONDITION_FAILED",
                            message: "CAPTCHA verification required",
                            cause: { 
                                requiresCaptcha: true,
                                captchaToken: challenge.token,
                                captchaQuestion: challenge.question,
                            },
                        })
                    }
                }
            }

            // Check brute force protection if enabled
            if (threatConfig.enabled && threatConfig.bruteForceProtection.enabled) {
                const bruteForceCheck = await checkBruteForce(
                    user.id,
                    threatConfig.bruteForceProtection,
                    company.id
                )

                if (bruteForceCheck.locked) {
                    throw new TRPCError({
                        code: "FORBIDDEN",
                        message: `Account locked due to too many failed login attempts. Please try again ${bruteForceCheck.unlockAt ? `after ${bruteForceCheck.unlockAt.toLocaleTimeString()}` : "later"}.`,
                    })
                }
            }

            // Check if user has a password (might be null for OAuth users)
            if (!user.password) {
                // Log failed attempt
                await prisma.auditLog.create({
                    data: {
                        userId: user.id,
                        action: "LOGIN_FAILED",
                        resource: "User",
                        resourceId: user.id,
                        status: "FAILED",
                        details: "No password set for user",
                    },
                })
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Invalid email or password",
                })
            }

            // Verify password
            const isValid = await verifyPassword(input.password, user.password)

            if (!isValid) {
                // Log failed attempt
                await prisma.auditLog.create({
                    data: {
                        userId: user.id,
                        action: "LOGIN_FAILED",
                        resource: "User",
                        resourceId: user.id,
                        status: "FAILED",
                        details: "Invalid password",
                    },
                })
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Invalid email or password",
                })
            }

            // Check if MFA is enabled and what method is configured
            if (user.mfaEnabled) {
                const hasMfaMethod = 
                    (user.mfaMethod === "TOTP" && user.mfaSecret !== null) ||
                    (user.mfaMethod === "SMS" && user.phoneNumber !== null) ||
                    (user.mfaMethod === "EMAIL" && user.email !== null) ||
                    (user.mfaMethod === "WEBAUTHN" && (await prisma.mfaCredential.count({ where: { userId: user.id } })) > 0);

                if (!hasMfaMethod) {
                    // MFA is enabled but not configured, require setup
                    await createSession(user.id, user.email, { mfaVerified: false, mfaSetupRequired: true });
                    return { success: true, mfaSetupRequired: true };
                } else {
                    // MFA is enabled and configured, require verification
                    await createSession(user.id, user.email, { mfaVerified: false, mfaRequired: true });
                    return { success: true, mfaRequired: true };
                }
            }

            // Check IP whitelist if enabled
            if (ipAddress) {
                const { isIpWhitelisted } = await import("@/lib/ip-whitelist");
                const ipCheck = await isIpWhitelisted(ipAddress, user.id, user.companyId || undefined);
                
                if (!ipCheck.allowed) {
                    // Create audit log for blocked login attempt
                    const { createAuditLog } = await import("@/lib/audit-log");
                    await createAuditLog({
                        action: "LOGIN_BLOCKED_IP",
                        resource: "User",
                        resourceId: user.id,
                        userId: user.id,
                        ipAddress,
                        userAgent,
                        status: "BLOCKED",
                        details: { reason: ipCheck.reason },
                    });

                    throw new TRPCError({
                        code: "FORBIDDEN",
                        message: ipCheck.reason || "Access denied from this IP address",
                    });
                }
            }

            // Check geographic restrictions if enabled
            if (ipAddress) {
                const { checkGeographicRestriction } = await import("@/lib/ip-whitelist");
                const geoCheck = await checkGeographicRestriction(ipAddress, user.id, user.companyId || undefined);
                
                if (!geoCheck.allowed) {
                    // Create audit log for blocked login attempt
                    const { createAuditLog } = await import("@/lib/audit-log");
                    await createAuditLog({
                        action: "LOGIN_BLOCKED_GEO",
                        resource: "User",
                        resourceId: user.id,
                        userId: user.id,
                        ipAddress,
                        userAgent,
                        status: "BLOCKED",
                        details: { reason: geoCheck.reason, countryCode: geoCheck.countryCode },
                    });

                    throw new TRPCError({
                        code: "FORBIDDEN",
                        message: geoCheck.reason || "Access denied from this location",
                    });
                }
            }

            // Check for suspicious location and VPN detection
            if (ipAddress) {
                const { checkSuspiciousLocation } = await import("@/lib/ip-whitelist");
                const suspiciousCheck = await checkSuspiciousLocation(ipAddress, user.id);
                
                // Check VPN detection setting
                const vpnDetectionEnabled = await prisma.settings.findUnique({
                    where: { key: "security.vpn_detection_enabled" },
                });

                if (vpnDetectionEnabled?.value === true && suspiciousCheck.geo) {
                    // Type guard for geo object - check if it has the expected properties
                    const geo = suspiciousCheck.geo as {
                        isVpn?: boolean
                        isProxy?: boolean
                        country?: string
                        countryCode?: string
                    }
                    if (geo && typeof geo === 'object' && ('isVpn' in geo || 'isProxy' in geo)) {
                        const isVpn = 'isVpn' in geo ? geo.isVpn : false
                        const isProxy = 'isProxy' in geo ? geo.isProxy : false
                        if (isVpn || isProxy) {
                            // Create audit log for VPN/proxy detection
                            const { createAuditLog } = await import("@/lib/audit-log");
                            await createAuditLog({
                                action: "LOGIN_VPN_DETECTED",
                                resource: "User",
                                resourceId: user.id,
                                userId: user.id,
                                ipAddress,
                                userAgent,
                                status: "WARNING",
                                details: { 
                                    isVpn: isVpn || false,
                                    isProxy: isProxy || false,
                                    country: 'country' in geo ? geo.country || null : null,
                                },
                            });
                        }
                    }
                }

                // Check suspicious location alerts setting
                const suspiciousAlertsEnabled = await prisma.settings.findUnique({
                    where: { key: "security.suspicious_location_alerts_enabled" },
                });

                if (suspiciousAlertsEnabled?.value === true && suspiciousCheck.suspicious && suspiciousCheck.geo) {
                    // Type guard for geo object - check if it has the expected properties
                    const geo = suspiciousCheck.geo as {
                        country?: string
                        countryCode?: string
                    }
                    if (geo && typeof geo === 'object') {
                        const country = 'country' in geo ? geo.country : null
                        const countryCode = 'countryCode' in geo ? geo.countryCode : null
                        // Create audit log for suspicious location
                        const { createAuditLog } = await import("@/lib/audit-log");
                        await createAuditLog({
                            action: "LOGIN_SUSPICIOUS_LOCATION",
                            resource: "User",
                            resourceId: user.id,
                            userId: user.id,
                            ipAddress,
                            userAgent,
                            status: "WARNING",
                            details: { 
                                reason: suspiciousCheck.reason || null,
                                country: country || null,
                                countryCode: countryCode || null,
                            },
                        });

                        // Note: We allow the login but log it as suspicious
                        // You could also block it or require additional verification here
                    }
                }
            }

            // Generate device fingerprint to check if device-specific MFA is required
            const { generateClientDeviceFingerprint, isDeviceTrusted } = await import("@/lib/device-fingerprint")
            const deviceFingerprint = generateClientDeviceFingerprint(userAgent, ipAddress)
            const deviceIsTrusted = await isDeviceTrusted(deviceFingerprint, user.id)

            // Check if device-specific MFA is required for untrusted devices
            const requireMfaForUntrustedDevices = await prisma.settings.findUnique({
                where: { key: "security.device.require_mfa_untrusted" },
            })
            const deviceRequiresMfa = requireMfaForUntrustedDevices?.value === true && !deviceIsTrusted

            // Check if MFA should be enforced (device-specific or global settings)
            const { shouldEnforceMfa, determineMfaRequirement } = await import("@/lib/mfa-enforcement")
            
            // Check if user has MFA method configured
            const hasMfaMethod = 
                (user.mfaMethod === "TOTP" && user.mfaSecret !== null) ||
                (user.mfaMethod === "SMS" && user.phoneNumber !== null) ||
                (user.mfaMethod === "EMAIL" && user.email !== null) ||
                (user.mfaMethod === "WEBAUTHN" && (await prisma.mfaCredential.count({ where: { userId: user.id } })) > 0);

            // If device requires MFA (untrusted device), enforce MFA regardless of other settings
            if (deviceRequiresMfa) {
                if (hasMfaMethod) {
                    // Device requires MFA and user has MFA configured, require verification
                    await createSession(user.id, user.email, {
                        mfaVerified: false,
                        mfaRequired: true,
                        ipAddress,
                        userAgent,
                    });
                    return { success: true, mfaRequired: true, deviceRequiresMfa: true };
                } else {
                    // Device requires MFA but user doesn't have MFA configured, require setup
                    await createSession(user.id, user.email, {
                        mfaVerified: false,
                        mfaSetupRequired: true,
                        mfaRequired: false,
                        ipAddress,
                        userAgent,
                    });
                    return { success: true, mfaSetupRequired: true, deviceRequiresMfa: true };
                }
            }

            // Check if MFA should be enforced based on user settings or global enforcement
            const enforceMfa = await shouldEnforceMfa(user.id, user.role, user.mfaEnabled)
            
            if (enforceMfa) {
                // MFA is enforced - determine if setup or verification is required
                const mfaRequirement = await determineMfaRequirement(user.id, user.role, user.mfaEnabled, hasMfaMethod)
                
                if (mfaRequirement.mfaSetupRequired) {
                    // User needs to set up MFA
                    await createSession(user.id, user.email, {
                        mfaVerified: false,
                        mfaSetupRequired: true,
                        mfaRequired: false,
                        ipAddress,
                        userAgent,
                    });
                    return { success: true, mfaSetupRequired: true };
                } else if (mfaRequirement.mfaRequired) {
                    // User needs to verify MFA
                    await createSession(user.id, user.email, {
                        mfaVerified: false,
                        mfaRequired: true,
                        ipAddress,
                        userAgent,
                    });
                    return { success: true, mfaRequired: true };
                }
            }

            // Update last login time
            await prisma.user.update({
                where: { id: user.id },
                data: { lastLoginAt: new Date() },
            });

            // Create audit log for successful login
            const { createAuditLog } = await import("@/lib/audit-log")
            await createAuditLog({
                action: "LOGIN_SUCCESS",
                resource: "User",
                resourceId: user.id,
                userId: user.id,
                ipAddress,
                userAgent,
            });

            // Run anomaly detection if enabled (after successful login)
            if (threatConfig.enabled && threatConfig.anomalyDetection.enabled) {
                const { detectAnomalies } = await import("@/lib/threat-detection")
                const anomalyCheck = await detectAnomalies(
                    user.id,
                    ipAddress,
                    userAgent,
                    threatConfig.anomalyDetection,
                    company.id
                )

                // If anomaly detected, log it but don't block login
                // The threat event has already been created by detectAnomalies
                if (anomalyCheck.isAnomaly) {
                    console.warn(`[Threat Detection] Anomaly detected for user ${user.id}:`, anomalyCheck.reasons)
                }
            }

            // Create session with device info
            await createSession(user.id, user.email, {
                ipAddress,
                userAgent,
            });

            return {
                success: true,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                },
            };
        }),
    extensionLogin: baseProcedure
        .input(
            z.object({
                subdomain: z.string().min(1, "Subdomain is required"),
                email: z.string().email("Invalid email address"),
                password: z.string().min(1, "Password is required"),
                captchaToken: z.string().optional(),
                captchaAnswer: z.number().optional(),
            })
        )
        .mutation(async ({ input }) => {
            // Get request metadata
            const headersList = await headers();
            const { ipAddress, userAgent } = getRequestMetadata(headersList);

            // Find company by subdomain
            const company = await prisma.company.findUnique({
                where: { subdomain: input.subdomain },
            });

            if (!company) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Company not found for this subdomain",
                });
            }

            // Get threat detection configuration
            const {
                getThreatDetectionConfig,
                checkRateLimit,
                checkBruteForce,
                shouldRequireCaptcha,
            } = await import("@/lib/threat-detection");
            const threatConfig = await getThreatDetectionConfig(company.id);

            // Check rate limiting if enabled
            if (threatConfig.enabled && threatConfig.rateLimiting.enabled && ipAddress) {
                const rateLimitCheck = await checkRateLimit(
                    ipAddress,
                    "IP",
                    "LOGIN",
                    threatConfig.rateLimiting.login,
                    company.id
                );

                if (rateLimitCheck.exceeded) {
                    throw new TRPCError({
                        code: "TOO_MANY_REQUESTS",
                        message: `Too many login attempts. Please try again after ${new Date(rateLimitCheck.resetAt).toLocaleTimeString()}.`,
                    });
                }
            }

            // Find user in this company
            const user = await prisma.user.findFirst({
                where: {
                    email: input.email,
                    companyId: company.id,
                },
            });

            if (!user) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Invalid email or password",
                });
            }

            // Check CAPTCHA requirement
            if (threatConfig.enabled && threatConfig.captcha.enabled && ipAddress) {
                const requiresCaptcha = await shouldRequireCaptcha(
                    ipAddress,
                    "IP",
                    "LOGIN",
                    threatConfig.captcha,
                    company.id
                );
                if (requiresCaptcha) {
                    if (input.captchaToken && input.captchaAnswer !== undefined) {
                        const { verifyCaptchaFromStore } = await import("@/lib/captcha");
                        const isValid = verifyCaptchaFromStore(input.captchaToken, input.captchaAnswer);
                        if (!isValid) {
                            throw new TRPCError({
                                code: "BAD_REQUEST",
                                message: "Invalid CAPTCHA answer. Please try again.",
                            });
                        }
                    } else {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message: "CAPTCHA required",
                        });
                    }
                }
            }

            // Check brute force protection if enabled (before password verification)
            if (threatConfig.enabled && threatConfig.bruteForceProtection.enabled) {
                const bruteForceCheck = await checkBruteForce(
                    user.id,
                    threatConfig.bruteForceProtection,
                    company.id
                );

                if (bruteForceCheck.locked) {
                    throw new TRPCError({
                        code: "FORBIDDEN",
                        message: `Account locked due to too many failed login attempts. Please try again ${bruteForceCheck.unlockAt ? `after ${bruteForceCheck.unlockAt.toLocaleTimeString()}` : "later"}.`,
                    });
                }
            }

            // Check if user has a password (might be null for OAuth users)
            if (!user.password) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Invalid email or password",
                });
            }

            // Verify password
            const isValidPassword = await verifyPassword(input.password, user.password);
            if (!isValidPassword) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Invalid email or password",
                });
            }

            // Check if user is active
            if (!user.isActive) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Your account has been deactivated. Please contact your administrator.",
                });
            }

            // Create session and get the token
            // We need to generate the token ourselves to return it
            const { SignJWT } = await import("jose");
            const SESSION_SECRET = process.env.SESSION_SECRET || "default-secret-change-in-production";
            const secret = new TextEncoder().encode(SESSION_SECRET);
            
            // Get session timeout from settings
            const sessionTimeoutSetting = await prisma.settings.findUnique({
                where: { key: "security.session.timeout_minutes" },
            });
            const timeoutMinutes = (sessionTimeoutSetting?.value as number) ?? 30;
            const expirationTime = `${timeoutMinutes}m`;
            const maxAge = timeoutMinutes * 60;

            // Generate device fingerprint
            const { generateClientDeviceFingerprint, isDeviceTrusted } = await import("@/lib/device-fingerprint");
            const deviceFingerprint = generateClientDeviceFingerprint(userAgent, ipAddress);
            const deviceIsTrusted = await isDeviceTrusted(deviceFingerprint, user.id);

            // Check if device-specific MFA is required
            const requireMfaForUntrustedDevices = await prisma.settings.findUnique({
                where: { key: "security.device.require_mfa_untrusted" },
            });
            const deviceRequiresMfa = requireMfaForUntrustedDevices?.value === true && !deviceIsTrusted;
            
            // Check if MFA should be enforced based on settings
            const { shouldEnforceMfa } = await import("@/lib/mfa-enforcement")
            const enforceMfa = await shouldEnforceMfa(user.id, user.role, user.mfaEnabled)
            
            // MFA is required if device requires it OR if enforced by settings
            const finalMfaRequired = deviceRequiresMfa || enforceMfa;

            const payload = { userId: user.id, email: user.email, isLoggedIn: true, mfaVerified: true, mfaSetupRequired: false, mfaRequired: finalMfaRequired };
            const sessionToken = await new SignJWT(payload)
                .setProtectedHeader({ alg: "HS256" })
                .setExpirationTime(expirationTime)
                .sign(secret);

            // Create session in database and set cookie
            const expires = new Date(Date.now() + maxAge * 1000);
            const { parseUserAgent } = await import("@/lib/device-parser");
            const deviceInfo = parseUserAgent(userAgent);

            try {
                await prisma.session.create({
                    data: {
                        sessionToken: sessionToken,
                        userId: user.id,
                        expires,
                        ipAddress: ipAddress || null,
                        userAgent: userAgent || null,
                        deviceName: deviceInfo.deviceName,
                        deviceType: deviceInfo.deviceType,
                        deviceFingerprint,
                        isTrusted: deviceIsTrusted,
                        requireMfa: finalMfaRequired || false,
                        lastActiveAt: new Date(),
                    },
                });
            } catch (error) {
                console.error("Failed to create database session record:", error);
            }

            // Also set the cookie (for web browser compatibility)
            const cookieStore = await cookies();
            cookieStore.set("session", sessionToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                maxAge,
                path: "/",
            });

            // Create audit log
            const { createAuditLog } = await import("@/lib/audit-log");
            await createAuditLog({
                action: "LOGIN_SUCCESS",
                resource: "User",
                resourceId: user.id,
                userId: user.id,
                ipAddress: ipAddress || null,
                userAgent: userAgent || null,
                details: { source: "extension" },
            });

            return {
                success: true,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                },
                company: {
                    id: company.id,
                    name: company.name,
                    subdomain: company.subdomain,
                },
                // Return the session token for extension to store and use
                sessionToken: sessionToken || undefined,
            };
        }),
    logout: baseProcedure
        .mutation(async () => {
            await destroySession();
            return { success: true };
        }),
    getCurrentUser: baseProcedure
        .query(async () => {
            const session = await getSession();
            
            if (!session) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Not authenticated",
                });
            }

            const userRes = await prisma.user.findUnique({
                where: { id: session.userId },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    emailVerified: true,
                    image: true,
                    role: true,
                    mfaEnabled: true,
                    mfaSecret: true,
                    mfaMethod: true,
                    phoneNumber: true,
                    createdById: true,
                    _count: {
                        select: {
                            mfaCredentials: true,
                        },
                    },
                },
            });

            if (!userRes) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User not found",
                });
            }

            const { mfaSecret, _count, ...rest } = userRes;

            // Determine if MFA verification is needed
            const hasMfaMethod = 
                (rest.mfaMethod === "TOTP" && mfaSecret !== null) ||
                (rest.mfaMethod === "SMS" && rest.phoneNumber !== null) ||
                (rest.mfaMethod === "EMAIL" && rest.email !== null) ||
                (rest.mfaMethod === "WEBAUTHN" && _count.mfaCredentials > 0);

            // Check if MFA should be enforced based on settings
            const { shouldEnforceMfa, determineMfaRequirement } = await import("@/lib/mfa-enforcement")
            const enforceMfa = await shouldEnforceMfa(rest.id, rest.role, rest.mfaEnabled)
            
            // Determine MFA requirements
            // Priority: session flag (for device-specific requirements) > enforcement logic
            let mfaSetupRequired = session.mfaSetupRequired === true
            let shouldVerifyMfa = false
            
            if (!mfaSetupRequired && enforceMfa) {
                const mfaRequirement = await determineMfaRequirement(rest.id, rest.role, rest.mfaEnabled, hasMfaMethod)
                mfaSetupRequired = mfaRequirement.mfaSetupRequired
                shouldVerifyMfa = mfaRequirement.mfaRequired && !session.mfaVerified
            }

            return {
                user: rest,
                session,
                shouldVerifyMfa,
                mfaSetupRequired,
                mfaMethod: rest.mfaMethod,
            };
        }),
    getCurrentUserPermissions: baseProcedure
        .query(async ({ ctx }) => {
            const { permissions } = ctx;
            return { permissions };
        }),
    generateMfaQr: baseProcedure
        .query(async () => {
            const session = await getSession()
            if (!session) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Not authenticated",
                });
            }
            const authenticator = await import("otplib").then(mod => mod.authenticator)
            const qrcode = await import("qrcode").then(mod => mod.default)
            const { encrypt } = await import("@/lib/crypto")
            
            // Generate a new MFA secret
            const user = await prisma.user.findUnique({ where: { id: session.userId } })
            
            let secret: string

            // Only return existing secret if MFA is already fully enabled and configured
            // If MFA is not enabled yet (setup in progress), always regenerate and save a new secret
            if (user && user.mfaEnabled && user.mfaSecret) {
                // User has MFA enabled - use existing secret
                secret = decrypt(user.mfaSecret)
            } else {
                // Generate new secret for setup
                secret = authenticator.generateSecret()
                // Always save/update the secret for users who haven't completed MFA setup
                // This ensures the QR code matches what's in the database
                if (user) {
                    await prisma.user.update({
                        where: { id: session.userId },
                        data: {
                            mfaSecret: encrypt(secret),
                        },
                    })
                }
            }
            
            // Use "PassBangla" as the issuer name instead of "Password Storage"
            const otpAuth = authenticator.keyuri(session.email, "PassBangla", secret)
            const qr = await qrcode.toDataURL(otpAuth)
            return { qr }
        }),
    setupMfa: baseProcedure
        .input(z.object({
            code: z.string().min(6).max(6),
            method: z.enum(["TOTP", "SMS", "EMAIL", "WEBAUTHN"]).optional(),
        }))
        .mutation(async ({ input }) => {
            const session = await getSession()
            if (!session) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Not authenticated",
                });
            }
            const user = await prisma.user.findUnique({ where: { id: session.userId } })
            if (!user) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User not found",
                });
            }

            const method = input.method || user.mfaMethod || "TOTP"

            // Check if credentials are configured for the selected method
            if (method === "SMS") {
                const { checkSmsCredentials } = await import("@/lib/sms")
                const credentialsCheck = await checkSmsCredentials()
                if (!credentialsCheck.configured) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: credentialsCheck.error || "SMS credentials are not configured. Please configure them in Settings → MFA Credentials before enabling SMS MFA.",
                    });
                }
                if (!user.phoneNumber) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Phone number is required for SMS MFA. Please add a phone number to your account.",
                    });
                }
            } else if (method === "WEBAUTHN") {
                const { checkWebAuthnCredentials } = await import("@/lib/webauthn")
                const credentialsCheck = await checkWebAuthnCredentials()
                if (!credentialsCheck.configured) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: credentialsCheck.error || "WebAuthn credentials are not configured. Please configure them in Settings → MFA Credentials before enabling WebAuthn MFA.",
                    });
                }
            }

            // Verify based on method
            if (method === "TOTP") {
                if (!user.mfaSecret) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "No MFA secret found",
                    });
                }
                const decryptedSecret = decrypt(user.mfaSecret)
                const authenticator = await import("otplib").then(mod => mod.authenticator)
                const isValid = authenticator.check(input.code, decryptedSecret)
                if (!isValid) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Invalid MFA code",
                    });
                }
            } else if (method === "SMS") {
                const { verifyMfaCode } = await import("@/lib/mfa-codes")
                const isValid = verifyMfaCode(user.id, "SMS", input.code)
                if (!isValid) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Invalid or expired SMS code",
                    });
                }
            } else if (method === "EMAIL") {
                const { verifyMfaCode } = await import("@/lib/mfa-codes")
                const isValid = verifyMfaCode(user.id, "EMAIL", input.code)
                if (!isValid) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Invalid or expired email code",
                    });
                }
            } else if (method === "WEBAUTHN") {
                // WebAuthn setup is handled separately via verifyWebAuthnRegistration
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "WebAuthn setup is handled separately",
                });
            }

            // Enable MFA and set method
            await prisma.user.update({
                where: { id: session.userId },
                data: { 
                    mfaEnabled: true,
                    mfaMethod: method,
                },
            });

            // Create audit log
            const { createAuditLog } = await import("@/lib/audit-log")
            await createAuditLog({
                action: "MFA_SETUP",
                resource: "User",
                resourceId: session.userId,
                details: { method },
                userId: session.userId,
            });
            await createSession(user.id, user.email, { mfaVerified: true });
            return { success: true };
        }),
    disableMfa: baseProcedure
        .mutation(async () => {
            const session = await getSession()
            if (!session) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Not authenticated",
                });
            }
            
            const user = await prisma.user.findUnique({ where: { id: session.userId } })
            if (!user) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User not found",
                });
            }

            // Check if MFA is enforced by global settings - prevent disabling if enforced
            const { shouldEnforceMfa } = await import("@/lib/mfa-enforcement")
            const enforceMfa = await shouldEnforceMfa(user.id, user.role, false) // Check with mfaEnabled=false
            
            if (enforceMfa) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "MFA is required by your organization's security policy and cannot be disabled",
                });
            }

            // Disable MFA
            await prisma.user.update({
                where: { id: session.userId },
                data: { 
                    mfaEnabled: false,
                    mfaSecret: null,
                    mfaMethod: null,
                },
            });

            // Delete MFA credentials
            await prisma.mfaCredential.deleteMany({
                where: { userId: session.userId }
            });

            // Delete recovery codes
            await prisma.recoveryCode.deleteMany({
                where: { userId: session.userId }
            });

            // Create audit log
            const { createAuditLog } = await import("@/lib/audit-log")
            await createAuditLog({
                action: "MFA_DISABLED",
                resource: "User",
                resourceId: session.userId,
                userId: session.userId,
            });

            return { success: true };
        }),
    verifyMfa: baseProcedure
        .input(z.object({
            code: z.string().min(6).max(6).optional(),
            method: z.enum(["TOTP", "SMS", "EMAIL", "WEBAUTHN"]).optional(),
        }))
        .mutation(async ({ input }) => {
            const session = await getSession()
            if (!session) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Not authenticated",
                });
            }
            const user = await prisma.user.findUnique({ 
                where: { id: session.userId },
                include: { mfaCredentials: true },
            })
            if (!user) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User not found",
                });
            }

            const method = input.method || user.mfaMethod || "TOTP"

            // Verify based on method
            if (method === "TOTP") {
                if (!user.mfaSecret || !input.code) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "TOTP code is required",
                    });
                }
                const decryptedSecret = decrypt(user.mfaSecret);
                const authenticator = await import("otplib").then(mod => mod.authenticator);
                const isValid = authenticator.check(input.code, decryptedSecret)
                if (!isValid) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Invalid MFA code",
                    });
                }
            } else if (method === "SMS") {
                // Check if SMS credentials are configured
                const { checkSmsCredentials } = await import("@/lib/sms")
                const credentialsCheck = await checkSmsCredentials()
                if (!credentialsCheck.configured) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: credentialsCheck.error || "SMS credentials are not configured. Please configure them in Settings → MFA Credentials.",
                    });
                }
                if (!input.code) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "SMS code is required",
                    });
                }
                const { verifyMfaCode } = await import("@/lib/mfa-codes")
                const isValid = verifyMfaCode(user.id, "SMS", input.code)
                if (!isValid) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Invalid or expired SMS code",
                    });
                }
            } else if (method === "EMAIL") {
                if (!input.code) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Email code is required",
                    });
                }
                const { verifyMfaCode } = await import("@/lib/mfa-codes")
                const isValid = verifyMfaCode(user.id, "EMAIL", input.code)
                if (!isValid) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Invalid or expired email code",
                    });
                }
            } else if (method === "WEBAUTHN") {
                // Check if WebAuthn credentials are configured
                const { checkWebAuthnCredentials } = await import("@/lib/webauthn")
                const credentialsCheck = await checkWebAuthnCredentials()
                if (!credentialsCheck.configured) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: credentialsCheck.error || "WebAuthn credentials are not configured. Please configure them in Settings → MFA Credentials.",
                    });
                }
                // WebAuthn verification is handled separately via verifyWebAuthnAuthentication
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "WebAuthn verification is handled separately",
                });
            }

            // Create audit logs
            const { createAuditLog } = await import("@/lib/audit-log")
            await Promise.all([
                createAuditLog({
                    action: "MFA_VERIFIED",
                    resource: "User",
                    resourceId: user.id,
                    details: { method },
                    userId: user.id,
                }),
                createAuditLog({
                    action: "LOGIN_SUCCESS",
                    resource: "User",
                    resourceId: user.id,
                    details: { mfaMethod: method },
                    userId: user.id,
                }),
            ])

            await createSession(user.id, user.email, { mfaVerified: true });
            return { success: true };
        }),

    // SMS MFA
    sendSmsMfaCode: baseProcedure
        .mutation(async () => {
            const session = await getSession()
            if (!session) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Not authenticated",
                });
            }
            const user = await prisma.user.findUnique({ where: { id: session.userId } })
            if (!user || !user.phoneNumber) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Phone number not set. Please add a phone number to your account.",
                });
            }

            // Check if SMS credentials are configured
            const { checkSmsCredentials } = await import("@/lib/sms")
            const credentialsCheck = await checkSmsCredentials()
            if (!credentialsCheck.configured) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: credentialsCheck.error || "SMS credentials are not configured. Please configure them in Settings → MFA Credentials.",
                });
            }

            const { generateMfaCode, storeMfaCode } = await import("@/lib/mfa-codes")
            const { sendSmsCode } = await import("@/lib/sms")
            
            const code = generateMfaCode()
            storeMfaCode(user.id, "SMS", code)
            
            const result = await sendSmsCode(user.phoneNumber, code)
            if (!result.success) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: result.error || "Failed to send SMS code",
                });
            }

            return { success: true };
        }),

    verifySmsMfa: baseProcedure
        .input(z.object({
            code: z.string().min(6).max(6),
        }))
        .mutation(async ({ input }) => {
            const session = await getSession()
            if (!session) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Not authenticated",
                });
            }
            const user = await prisma.user.findUnique({ where: { id: session.userId } })
            if (!user) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User not found",
                });
            }

            const { verifyMfaCode } = await import("@/lib/mfa-codes")
            const isValid = verifyMfaCode(user.id, "SMS", input.code)
            
            if (!isValid) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Invalid or expired SMS code",
                });
            }

            // Create audit logs
            const { createAuditLog } = await import("@/lib/audit-log")
            await Promise.all([
                createAuditLog({
                    action: "MFA_VERIFIED",
                    resource: "User",
                    resourceId: user.id,
                    details: { method: "SMS" },
                    userId: user.id,
                }),
                createAuditLog({
                    action: "LOGIN_SUCCESS",
                    resource: "User",
                    resourceId: user.id,
                    details: { mfaMethod: "SMS" },
                    userId: user.id,
                }),
            ])

            await createSession(user.id, user.email, { mfaVerified: true });
            return { success: true };
        }),

    // Email MFA
    sendEmailMfaCode: baseProcedure
        .mutation(async () => {
            const session = await getSession()
            if (!session) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Not authenticated",
                });
            }
            const user = await prisma.user.findUnique({ where: { id: session.userId } })
            if (!user || !user.email) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Email not found",
                });
            }

            const { generateMfaCode, storeMfaCode } = await import("@/lib/mfa-codes")
            const { sendEmail } = await import("@/lib/mailer")
            
            const code = generateMfaCode()
            storeMfaCode(user.id, "EMAIL", code)
            
            const result = await sendEmail({
                to: user.email,
                subject: "Your Password Storage Verification Code",
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #333;">Verification Code</h2>
                        <p>Your verification code is:</p>
                        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center;">
                            <h1 style="color: #333; font-size: 32px; letter-spacing: 4px; margin: 0;">${code}</h1>
                        </div>
                        <p style="color: #666; font-size: 14px;">This code will expire in 10 minutes.</p>
                        <p style="color: #999; font-size: 12px; margin-top: 20px;">
                            If you didn't request this code, please ignore this email.
                        </p>
                    </div>
                `,
                text: `Your Password Storage verification code is: ${code}. This code will expire in 10 minutes.`,
            })

            if (!result.success) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: result.error || "Failed to send email code",
                });
            }

            return { success: true };
        }),

    verifyEmailMfa: baseProcedure
        .input(z.object({
            code: z.string().min(6).max(6),
        }))
        .mutation(async ({ input }) => {
            const session = await getSession()
            if (!session) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Not authenticated",
                });
            }
            const user = await prisma.user.findUnique({ where: { id: session.userId } })
            if (!user) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User not found",
                });
            }

            const { verifyMfaCode } = await import("@/lib/mfa-codes")
            const isValid = verifyMfaCode(user.id, "EMAIL", input.code)
            
            if (!isValid) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Invalid or expired email code",
                });
            }

            // Create audit logs
            const { createAuditLog } = await import("@/lib/audit-log")
            await Promise.all([
                createAuditLog({
                    action: "MFA_VERIFIED",
                    resource: "User",
                    resourceId: user.id,
                    details: { method: "EMAIL" },
                    userId: user.id,
                }),
                createAuditLog({
                    action: "LOGIN_SUCCESS",
                    resource: "User",
                    resourceId: user.id,
                    details: { mfaMethod: "EMAIL" },
                    userId: user.id,
                }),
            ])

            await createSession(user.id, user.email, { mfaVerified: true });
            return { success: true };
        }),

    // WebAuthn MFA
    generateWebAuthnRegistration: baseProcedure
        .query(async () => {
            const session = await getSession()
            if (!session) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Not authenticated",
                });
            }
            const user = await prisma.user.findUnique({
                where: { id: session.userId },
                include: { mfaCredentials: true },
            })
            if (!user) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User not found",
                });
            }

            // Check if WebAuthn credentials are configured
            const { checkWebAuthnCredentials } = await import("@/lib/webauthn")
            const credentialsCheck = await checkWebAuthnCredentials()
            if (!credentialsCheck.configured) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: credentialsCheck.error || "WebAuthn credentials are not configured. Please configure them in Settings → MFA Credentials.",
                });
            }

            const { generateWebAuthnRegistrationOptions } = await import("@/lib/webauthn")
            
            const existingCredentials = user.mfaCredentials.map((cred) => ({
                credentialID: cred.credentialId,
                publicKey: cred.publicKey,
                counter: Number(cred.counter),
                deviceType: normalizeWebAuthnDeviceType(cred.deviceType),
                backedUp: cred.backedUp,
                transports: cred.transports ? JSON.parse(cred.transports) : undefined,
            }))

            const { options, challenge } = await generateWebAuthnRegistrationOptions(
                user.id,
                user.email,
                user.name,
                existingCredentials
            )

            // Store challenge temporarily (in production, use Redis)
            const challengeStore = (global as unknown as { webauthnChallenges: Map<string, string> }).webauthnChallenges || new Map()
            challengeStore.set(session.userId, challenge)
            ;(global as unknown as { webauthnChallenges: Map<string, string> }).webauthnChallenges = challengeStore

            return { options };
        }),

    verifyWebAuthnRegistration: baseProcedure
        .input(z.object({
            response: z.any(),
        }))
        .mutation(async ({ input }) => {
            const session = await getSession()
            if (!session) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Not authenticated",
                });
            }
            const user = await prisma.user.findUnique({ where: { id: session.userId } })
            if (!user) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User not found",
                });
            }

            const challengeStore = (global as unknown as { webauthnChallenges: Map<string, string> }).webauthnChallenges || new Map()
            const expectedChallenge = challengeStore.get(session.userId)
            challengeStore.delete(session.userId)

            if (!expectedChallenge) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Registration challenge not found or expired",
                });
            }

            const { verifyWebAuthnRegistration } = await import("@/lib/webauthn")
            
            // Get origin from headers
            const headersList = await headers()
            const origin = headersList.get("origin") || headersList.get("referer") || undefined
            
            const response = input.response as RegistrationResponseJSON
            const result = await verifyWebAuthnRegistration(response, expectedChallenge, origin)

            if (!result.verified || !result.credential) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: result.error || "WebAuthn registration verification failed",
                });
            }

            // Save credential to database
            await prisma.mfaCredential.create({
                data: {
                    userId: user.id,
                    credentialId: result.credential.credentialID,
                    publicKey: result.credential.publicKey,
                    counter: BigInt(result.credential.counter),
                    deviceType: result.credential.deviceType,
                    backedUp: result.credential.backedUp,
                    transports: result.credential.transports ? JSON.stringify(result.credential.transports) : null,
                },
            })

            return { success: true };
        }),

    generateWebAuthnAuthentication: baseProcedure
        .query(async () => {
            const session = await getSession()
            if (!session) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Not authenticated",
                });
            }
            const user = await prisma.user.findUnique({
                where: { id: session.userId },
                include: { mfaCredentials: true },
            })
            if (!user) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User not found",
                });
            }

            if (user.mfaCredentials.length === 0) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "No WebAuthn credentials found",
                });
            }

            // Check if WebAuthn credentials are configured
            const { checkWebAuthnCredentials } = await import("@/lib/webauthn")
            const credentialsCheck = await checkWebAuthnCredentials()
            if (!credentialsCheck.configured) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: credentialsCheck.error || "WebAuthn credentials are not configured. Please configure them in Settings → MFA Credentials.",
                });
            }

            const { generateWebAuthnAuthenticationOptions } = await import("@/lib/webauthn")
            
            const credentials = user.mfaCredentials.map((cred) => ({
                credentialID: cred.credentialId,
                publicKey: cred.publicKey,
                counter: Number(cred.counter),
                deviceType: normalizeWebAuthnDeviceType(cred.deviceType),
                backedUp: cred.backedUp,
                transports: cred.transports ? JSON.parse(cred.transports) : undefined,
            }))

            const { options, challenge } = await generateWebAuthnAuthenticationOptions(credentials)

            // Store challenge temporarily
            const challengeStore = (global as unknown as { webauthnChallenges: Map<string, string> }).webauthnChallenges || new Map()
            challengeStore.set(session.userId, challenge)
            ;(global as unknown as { webauthnChallenges: Map<string, string> }).webauthnChallenges = challengeStore

            return { options };
        }),

    verifyWebAuthnAuthentication: baseProcedure
        .input(z.object({
            response: z.any(),
        }))
        .mutation(async ({ input }) => {
            const session = await getSession()
            if (!session) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Not authenticated",
                });
            }
            const user = await prisma.user.findUnique({
                where: { id: session.userId },
                include: { mfaCredentials: true },
            })
            if (!user) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User not found",
                });
            }

            const challengeStore = (global as unknown as { webauthnChallenges: Map<string, string> }).webauthnChallenges || new Map()
            const expectedChallenge = challengeStore.get(session.userId)
            challengeStore.delete(session.userId)

            if (!expectedChallenge) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Authentication challenge not found or expired",
                });
            }

            // Find the credential being used
            // The response.id is already base64url encoded
            const response = input.response as AuthenticationResponseJSON
            const credentialId = response.id
            const credential = user.mfaCredentials.find((c) => c.credentialId === credentialId)

            if (!credential) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Credential not found",
                });
            }

            const { verifyWebAuthnAuthentication } = await import("@/lib/webauthn")
            const credentialData = {
                credentialID: credential.credentialId,
                publicKey: credential.publicKey,
                counter: Number(credential.counter),
                deviceType: normalizeWebAuthnDeviceType(credential.deviceType),
                backedUp: credential.backedUp,
                transports: credential.transports ? JSON.parse(credential.transports) : undefined,
            }

            const result = await verifyWebAuthnAuthentication(
                response,
                expectedChallenge,
                credentialData
            )

            if (!result.verified) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: result.error || "WebAuthn authentication verification failed",
                });
            }

            // Update counter
            if (result.newCounter !== undefined) {
                await prisma.mfaCredential.update({
                    where: { id: credential.id },
                    data: {
                        counter: BigInt(result.newCounter),
                        lastUsedAt: new Date(),
                    },
                })
            }

            // Create audit logs
            const { createAuditLog } = await import("@/lib/audit-log")
            await Promise.all([
                createAuditLog({
                    action: "MFA_VERIFIED",
                    resource: "User",
                    resourceId: user.id,
                    details: { method: "WEBAUTHN" },
                    userId: user.id,
                }),
                createAuditLog({
                    action: "LOGIN_SUCCESS",
                    resource: "User",
                    resourceId: user.id,
                    details: { mfaMethod: "WEBAUTHN" },
                    userId: user.id,
                }),
            ])

            await createSession(user.id, user.email, { mfaVerified: true });
            return { success: true };
        }),

    // Recovery Codes
    generateRecoveryCodes: baseProcedure
        .mutation(async () => {
            const session = await getSession()
            if (!session) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Not authenticated",
                });
            }
            const user = await prisma.user.findUnique({ where: { id: session.userId } })
            if (!user) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User not found",
                });
            }

            // Check if recovery codes are enabled
            const recoveryCodesEnabled = await prisma.settings.findUnique({
                where: { key: "mfa.recovery_codes_enabled" },
            })
            if (!recoveryCodesEnabled || recoveryCodesEnabled.value !== true) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Recovery codes are not enabled",
                });
            }

            // Get count from settings
            const recoveryCodesCountSetting = await prisma.settings.findUnique({
                where: { key: "mfa.recovery_codes_count" },
            })
            const count = (recoveryCodesCountSetting?.value as number) || 10

            // Generate new codes
            const { generateRecoveryCodes, hashRecoveryCode } = await import("@/lib/recovery-codes")
            const codes = generateRecoveryCodes(count)

            // Delete old unused codes
            await prisma.recoveryCode.deleteMany({
                where: {
                    userId: user.id,
                    used: false,
                },
            })

            // Hash and store new codes (hash without dashes for consistency)
            // Codes are displayed with dashes but stored/hashed without dashes
            const hashedCodes = await Promise.all(
                codes.map((formattedCode) => {
                    const rawCode = formattedCode.replace(/-/g, "").toUpperCase()
                    return hashRecoveryCode(rawCode)
                })
            )

            await Promise.all(
                hashedCodes.map((hash) =>
                    prisma.recoveryCode.create({
                        data: {
                            userId: user.id,
                            codeHash: hash,
                        },
                    })
                )
            )

            // Return plain codes only once (user should save them)
            return { codes };
        }),

    verifyRecoveryCode: baseProcedure
        .input(z.object({
            code: z.string().min(1),
        }))
        .mutation(async ({ input }) => {
            const session = await getSession()
            if (!session) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Not authenticated",
                });
            }
            const user = await prisma.user.findUnique({
                where: { id: session.userId },
                include: { recoveryCodes: true },
            })
            if (!user) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User not found",
                });
            }

            // Find unused recovery code
            const unusedCodes = user.recoveryCodes.filter((rc) => !rc.used)
            const { verifyRecoveryCode } = await import("@/lib/recovery-codes")

            // Remove dashes from input code for verification
            const normalizedCode = input.code.replace(/-/g, "").toUpperCase()

            for (const recoveryCode of unusedCodes) {
                const isValid = await verifyRecoveryCode(normalizedCode, recoveryCode.codeHash)
                if (isValid) {
                    // Mark as used
                    await prisma.recoveryCode.update({
                        where: { id: recoveryCode.id },
                        data: {
                            used: true,
                            usedAt: new Date(),
                        },
                    })

                    // Create audit logs
                    const { createAuditLog } = await import("@/lib/audit-log")
                    await Promise.all([
                        createAuditLog({
                            action: "MFA_VERIFIED",
                            resource: "User",
                            resourceId: user.id,
                            details: { method: "RECOVERY_CODE" },
                            userId: user.id,
                        }),
                        createAuditLog({
                            action: "LOGIN_SUCCESS",
                            resource: "User",
                            resourceId: user.id,
                            details: { mfaMethod: "RECOVERY_CODE" },
                            userId: user.id,
                        }),
                    ])

                    await createSession(user.id, user.email, { mfaVerified: true });
                    return { success: true };
                }
            }

            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Invalid or already used recovery code",
            });
        }),

    listRecoveryCodes: baseProcedure
        .query(async () => {
            const session = await getSession()
            if (!session) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Not authenticated",
                });
            }
            const recoveryCodes = await prisma.recoveryCode.findMany({
                where: {
                    userId: session.userId,
                },
                select: {
                    id: true,
                    used: true,
                    usedAt: true,
                    createdAt: true,
                },
                orderBy: {
                    createdAt: "desc",
                },
            })

            const unusedCount = recoveryCodes.filter((rc) => !rc.used).length
            const totalCount = recoveryCodes.length

            return {
                codes: recoveryCodes,
                unusedCount,
                totalCount,
            };
        }),

    // Admin MFA Reset
    resetUserMfa: protectedProcedure("user.edit")
        .input(z.object({
            userId: z.string(),
        }))
        .mutation(async ({ input, ctx }) => {
            // Check if admin MFA reset is enabled (default to true if setting doesn't exist)
            const adminResetSetting = await prisma.settings.findUnique({
                where: { key: "mfa.admin_reset_enabled" },
            })
            const adminResetEnabled = adminResetSetting ? (adminResetSetting.value === true) : true // Default to true if not set
            if (!adminResetEnabled) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Admin MFA reset is not enabled",
                });
            }

            const user = await prisma.user.findUnique({
                where: { id: input.userId },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    createdById: true,
                },
            })

            if (!user) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User not found",
                });
            }

            // Prevent users from resetting their creator's MFA (SUPER_ADMIN can reset anyone)
            if (ctx.userRole !== "SUPER_ADMIN" && user.createdById === ctx.userId) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "You cannot reset the MFA of the user who created your account",
                });
            }

            // Disable MFA and clear MFA data
            await Promise.all([
                prisma.user.update({
                    where: { id: input.userId },
                    data: {
                        mfaEnabled: false,
                        mfaSecret: null,
                        mfaMethod: null,
                    },
                }),
                prisma.mfaCredential.deleteMany({
                    where: { userId: input.userId },
                }),
                prisma.recoveryCode.deleteMany({
                    where: { userId: input.userId },
                }),
            ])

            // Create audit log
            await prisma.auditLog.create({
                data: {
                    action: "MFA_RESET",
                    resource: "User",
                    userId: input.userId,
                    resourceId: input.userId,
                    details: `MFA reset by admin ${ctx.userId}`,
                    status: "SUCCESS",
                },
            })

            return { success: true };
        }),
    findCompanyBySubdomain: baseProcedure
        .input(
            z.object({
                companyName: z.string().min(1, "Company name is required"),
            })
        )
        .query(async ({ input }) => {
            // Normalize company name to subdomain format
            const subdomain = input.companyName.toLowerCase().trim().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
            
            if (subdomain.length < 2) {
                return null
            }

            // Find company by subdomain
            const company = await prisma.company.findUnique({
                where: { subdomain },
                select: {
                    id: true,
                    name: true,
                    subdomain: true,
                },
            })

            if (!company) {
                return null
            }

            return {
                id: company.id,
                name: company.name,
                subdomain: company.subdomain,
            }
        }),
    
    // Email Verification Procedures
    sendVerificationEmail: baseProcedure
        .use(async ({ ctx, next }) => {
            if (!ctx.userId) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "You must be logged in to request email verification",
                });
            }
            return next({ ctx });
        })
        .mutation(async ({ ctx }) => {
            const user = await prisma.user.findUnique({
                where: { id: ctx.userId },
                select: { id: true, email: true, emailVerified: true },
            });

            if (!user) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User not found",
                });
            }

            if (user.emailVerified) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Email is already verified",
                });
            }

            const { createVerificationToken, sendVerificationEmail } = await import("@/lib/email-verification");
            const token = await createVerificationToken(user.id, user.email);
            
            // Get base URL for verification link
            const headersList = await headers();
            const protocol = headersList.get("x-forwarded-proto") || "http";
            const host = headersList.get("host") || "localhost:3000";
            const baseUrl = `${protocol}://${host}`;
            
            const result = await sendVerificationEmail(user.id, user.email, token, baseUrl);

            if (!result.success) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: result.error || "Failed to send verification email",
                });
            }

            // Create audit log
            const { createAuditLog } = await import("@/lib/audit-log");
            await createAuditLog({
                action: "EMAIL_VERIFICATION_SENT",
                resource: "User",
                resourceId: user.id,
                userId: ctx.userId,
            });

            return { success: true };
        }),

    verifyEmail: baseProcedure
        .input(
            z.object({
                token: z.string().min(1, "Verification token is required"),
            })
        )
        .mutation(async ({ input }) => {
            const { verifyToken } = await import("@/lib/email-verification");
            const verification = await verifyToken(input.token);

            if (!verification.valid || !verification.userId) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Invalid or expired verification token",
                });
            }

            console.log("Verifying email for user:", verification.userId);

            // Update user's email as verified
            const user = await prisma.user.update({
                where: { id: verification.userId },
                data: {
                    emailVerified: new Date(),
                },
                select: {
                    id: true,
                    email: true,
                    emailVerified: true,
                },
            });

            console.log("User email verified, updated user:", {
                id: user.id,
                email: user.email,
                emailVerified: user.emailVerified,
            });

            // Delete the used token
            await prisma.emailVerificationToken.deleteMany({
                where: { userId: verification.userId },
            });

            // Create audit log
            const { createAuditLog } = await import("@/lib/audit-log");
            await createAuditLog({
                action: "EMAIL_VERIFIED",
                resource: "User",
                resourceId: user.id,
                userId: user.id,
            });

            return {
                success: true,
                user: {
                    id: user.id,
                    email: user.email,
                    emailVerified: user.emailVerified,
                },
            };
        }),

    resendVerificationEmail: baseProcedure
        .use(async ({ ctx, next }) => {
            if (!ctx.userId) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "You must be logged in to resend verification email",
                });
            }
            return next({ ctx });
        })
        .mutation(async ({ ctx }) => {
            const user = await prisma.user.findUnique({
                where: { id: ctx.userId },
                select: { id: true, email: true, emailVerified: true },
            });

            if (!user) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User not found",
                });
            }

            if (user.emailVerified) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Email is already verified",
                });
            }

            const { createVerificationToken, sendVerificationEmail } = await import("@/lib/email-verification");
            const token = await createVerificationToken(user.id, user.email);
            
            // Get base URL for verification link
            const headersList = await headers();
            const protocol = headersList.get("x-forwarded-proto") || "http";
            const host = headersList.get("host") || "localhost:3000";
            const baseUrl = `${protocol}://${host}`;
            
            const result = await sendVerificationEmail(user.id, user.email, token, baseUrl);

            if (!result.success) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: result.error || "Failed to send verification email",
                });
            }

            // Create audit log
            const { createAuditLog } = await import("@/lib/audit-log");
            await createAuditLog({
                action: "EMAIL_VERIFICATION_RESENT",
                resource: "User",
                resourceId: user.id,
                userId: ctx.userId,
            });

            return { success: true };
        }),

    // Account Recovery - Forgot Password
    forgotPassword: baseProcedure
        .input(
            z.object({
                email: z.string().email("Invalid email address"),
            })
        )
        .mutation(async ({ input, ctx }) => {
            // Get companyId from subdomain if available (for multi-tenancy)
            let companyId: string | undefined = undefined
            if (ctx.subdomain) {
                const company = await prisma.company.findUnique({
                    where: { subdomain: ctx.subdomain },
                    select: { id: true },
                })
                if (company) {
                    companyId = company.id
                }
            }

            // Find user by email or recovery email
            const user = await prisma.user.findFirst({
                where: {
                    OR: [
                        { email: input.email },
                        { recoveryEmail: input.email },
                    ],
                    companyId: companyId || undefined, // Respect multi-tenancy
                },
                select: {
                    id: true,
                    email: true,
                    recoveryEmail: true,
                    name: true,
                },
            })

            // Don't reveal if user exists (security best practice)
            if (!user) {
                // Still return success to prevent email enumeration
                return { success: true }
            }

            // Determine which email to use (prefer recovery email if provided)
            const emailToUse = user.recoveryEmail || user.email

            // Create password reset token
            const { createPasswordResetToken, sendPasswordResetEmail } = await import("@/lib/password-reset")
            const token = await createPasswordResetToken(user.id, emailToUse)

            // Get base URL for reset link
            const headersList = await headers()
            const protocol = headersList.get("x-forwarded-proto") || "http"
            const host = headersList.get("host") || "localhost:3000"
            const baseUrl = `${protocol}://${host}`

            // Send password reset email
            await sendPasswordResetEmail(user.id, emailToUse, token, baseUrl)

            // Create audit log
            const { createAuditLog } = await import("@/lib/audit-log")
            await createAuditLog({
                action: "PASSWORD_RESET_REQUESTED",
                resource: "User",
                resourceId: user.id,
                userId: user.id,
            })

            return { success: true }
        }),

    resetPassword: baseProcedure
        .input(
            z.object({
                token: z.string().min(1, "Token is required"),
                newPassword: z.string().min(8, "Password must be at least 8 characters"),
            })
        )
        .mutation(async ({ input }) => {
            // Verify token
            const { verifyPasswordResetToken, markPasswordResetTokenAsUsed } = await import("@/lib/password-reset")
            const verification = await verifyPasswordResetToken(input.token)

            if (!verification.valid || !verification.userId) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Invalid or expired reset token",
                })
            }

            // Validate password
            const { validatePassword } = await import("@/lib/password-validation")
            const validation = await validatePassword(input.newPassword)
            if (!validation.isValid) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: validation.errors.join(". "),
                })
            }

            // Hash new password
            const hashedPassword = await hashPassword(input.newPassword)

            // Update user password
            await prisma.user.update({
                where: { id: verification.userId },
                data: { password: hashedPassword },
            })

            // Mark token as used
            await markPasswordResetTokenAsUsed(input.token)

            // Invalidate all sessions for security
            await prisma.session.deleteMany({
                where: { userId: verification.userId },
            })

            // Create audit log
            const { createAuditLog } = await import("@/lib/audit-log")
            await createAuditLog({
                action: "PASSWORD_RESET_COMPLETED",
                resource: "User",
                resourceId: verification.userId,
                userId: verification.userId,
            })

            return { success: true }
        }),

    // Security Questions
    setSecurityQuestions: baseProcedure
        .use(async ({ ctx, next }) => {
            if (!ctx.userId) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "You must be logged in to set security questions",
                })
            }
            return next({ ctx })
        })
        .input(
            z.object({
                questions: z.array(
                    z.object({
                        question: z.string().min(1, "Question is required"),
                        answer: z.string().min(1, "Answer is required"),
                    })
                ).min(2, "At least 2 security questions are required").max(5, "Maximum 5 security questions allowed"),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const { setSecurityQuestions } = await import("@/lib/security-questions")
            await setSecurityQuestions(ctx.userId!, input.questions)

            // Create audit log
            const { createAuditLog } = await import("@/lib/audit-log")
            await createAuditLog({
                action: "SECURITY_QUESTIONS_SET",
                resource: "User",
                resourceId: ctx.userId!,
                userId: ctx.userId!,
            })

            return { success: true }
        }),

    getSecurityQuestions: baseProcedure
        .use(async ({ ctx, next }) => {
            if (!ctx.userId) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "You must be logged in to view security questions",
                })
            }
            return next({ ctx })
        })
        .query(async ({ ctx }) => {
            const { getUserSecurityQuestions } = await import("@/lib/security-questions")
            const questions = await getUserSecurityQuestions(ctx.userId!)

            return { questions }
        }),

    verifySecurityQuestions: baseProcedure
        .input(
            z.object({
                email: z.string().email("Invalid email address"),
                answers: z.array(
                    z.object({
                        question: z.string().min(1, "Question is required"),
                        answer: z.string().min(1, "Answer is required"),
                    })
                ),
            })
        )
        .mutation(async ({ input, ctx }) => {
            // Get companyId from subdomain if available (for multi-tenancy)
            let companyId: string | undefined = undefined
            if (ctx.subdomain) {
                const company = await prisma.company.findUnique({
                    where: { subdomain: ctx.subdomain },
                    select: { id: true },
                })
                if (company) {
                    companyId = company.id
                }
            }

            // Find user by email or recovery email
            const user = await prisma.user.findFirst({
                where: {
                    OR: [
                        { email: input.email },
                        { recoveryEmail: input.email },
                    ],
                    companyId: companyId || undefined, // Respect multi-tenancy
                },
                select: { id: true },
            })

            if (!user) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User not found",
                })
            }

            const { verifySecurityQuestions } = await import("@/lib/security-questions")
            const result = await verifySecurityQuestions(user.id, input.answers)

            if (!result.valid) {
                // Create audit log for failed attempt
                const { createAuditLog } = await import("@/lib/audit-log")
                await createAuditLog({
                    action: "SECURITY_QUESTIONS_VERIFICATION_FAILED",
                    resource: "User",
                    resourceId: user.id,
                    userId: user.id,
                })

                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: `Incorrect answers. You got ${result.correctCount} out of ${result.totalCount} questions correct.`,
                })
            }

            // Create audit log for successful verification
            const { createAuditLog } = await import("@/lib/audit-log")
            await createAuditLog({
                action: "SECURITY_QUESTIONS_VERIFIED",
                resource: "User",
                resourceId: user.id,
                userId: user.id,
            })

            return { success: true, userId: user.id }
        }),

    // Get security questions for recovery (without authentication)
    getUserSecurityQuestionsForRecovery: baseProcedure
        .input(
            z.object({
                email: z.string().email("Invalid email address"),
            })
        )
        .mutation(async ({ input, ctx }) => {
            // Get companyId from subdomain if available (for multi-tenancy)
            let companyId: string | undefined = undefined
            if (ctx.subdomain) {
                const company = await prisma.company.findUnique({
                    where: { subdomain: ctx.subdomain },
                    select: { id: true },
                })
                if (company) {
                    companyId = company.id
                }
            }

            // Find user by email or recovery email
            const user = await prisma.user.findFirst({
                where: {
                    OR: [
                        { email: input.email },
                        { recoveryEmail: input.email },
                    ],
                    companyId: companyId || undefined,
                },
                select: { id: true },
            })

            if (!user) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "No account found with this email address",
                })
            }

            // Get user's security questions (without answers)
            const { getUserSecurityQuestions } = await import("@/lib/security-questions")
            const questions = await getUserSecurityQuestions(user.id)

            if (!questions || questions.length === 0) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "No security questions set for this account. Please use email recovery instead.",
                })
            }

            // Return questions without answers
            return {
                questions: questions.map((q) => ({
                    id: q.id,
                    question: q.question,
                })),
            }
        }),

    // Reset password via security questions (without authentication)
    resetPasswordViaSecurityQuestions: baseProcedure
        .input(
            z.object({
                userId: z.string(),
                newPassword: z.string().min(8, "Password must be at least 8 characters"),
            })
        )
        .mutation(async ({ input }) => {
            // Validate password
            const { validatePassword } = await import("@/lib/password-validation")
            const validation = await validatePassword(input.newPassword)
            if (!validation.isValid) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: validation.errors.join(". "),
                })
            }

            // Hash new password
            const hashedPassword = await hashPassword(input.newPassword)

            // Update user password
            await prisma.user.update({
                where: { id: input.userId },
                data: { password: hashedPassword },
            })

            // Invalidate all sessions for security
            await prisma.session.deleteMany({
                where: { userId: input.userId },
            })

            // Create audit log
            const { createAuditLog } = await import("@/lib/audit-log")
            await createAuditLog({
                action: "PASSWORD_RESET_VIA_SECURITY_QUESTIONS",
                resource: "User",
                resourceId: input.userId,
                userId: input.userId,
            })

            return { success: true }
        }),

    // Recovery Email Management
    setRecoveryEmail: baseProcedure
        .use(async ({ ctx, next }) => {
            if (!ctx.userId) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "You must be logged in to set recovery email",
                })
            }
            return next({ ctx })
        })
        .input(
            z.object({
                email: z.string().email("Invalid email address"),
            })
        )
        .mutation(async ({ input, ctx }) => {
            // Get current user's companyId for multi-tenancy check
            const currentUser = await prisma.user.findUnique({
                where: { id: ctx.userId! },
                select: { companyId: true },
            })

            // Check if email is already used by another user in the same company
            const existingUser = await prisma.user.findFirst({
                where: {
                    OR: [
                        { email: input.email },
                        { recoveryEmail: input.email },
                    ],
                    companyId: currentUser?.companyId || undefined,
                    NOT: { id: ctx.userId! },
                },
            })

            if (existingUser) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "This email is already in use",
                })
            }

            // Update recovery email (not verified initially)
            await prisma.user.update({
                where: { id: ctx.userId! },
                data: {
                    recoveryEmail: input.email,
                    recoveryEmailVerified: null,
                },
            })

            // Send verification email to recovery email
            const { createVerificationToken, sendVerificationEmail } = await import("@/lib/email-verification")
            const token = await createVerificationToken(ctx.userId!, input.email)

            const headersList = await headers()
            const protocol = headersList.get("x-forwarded-proto") || "http"
            const host = headersList.get("host") || "localhost:3000"
            const baseUrl = `${protocol}://${host}`

            await sendVerificationEmail(ctx.userId!, input.email, token, baseUrl)

            // Create audit log
            const { createAuditLog } = await import("@/lib/audit-log")
            await createAuditLog({
                action: "RECOVERY_EMAIL_SET",
                resource: "User",
                resourceId: ctx.userId!,
                userId: ctx.userId!,
            })

            return { success: true }
        }),

    getRecoveryEmail: baseProcedure
        .use(async ({ ctx, next }) => {
            if (!ctx.userId) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "You must be logged in to view recovery email",
                })
            }
            return next({ ctx })
        })
        .query(async ({ ctx }) => {
            const user = await prisma.user.findUnique({
                where: { id: ctx.userId! },
                select: {
                    recoveryEmail: true,
                    recoveryEmailVerified: true,
                },
            })

            return {
                recoveryEmail: user?.recoveryEmail || null,
                verified: !!user?.recoveryEmailVerified,
            }
        }),

    removeRecoveryEmail: baseProcedure
        .use(async ({ ctx, next }) => {
            if (!ctx.userId) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "You must be logged in to remove recovery email",
                })
            }
            return next({ ctx })
        })
        .mutation(async ({ ctx }) => {
            await prisma.user.update({
                where: { id: ctx.userId! },
                data: {
                    recoveryEmail: null,
                    recoveryEmailVerified: null,
                },
            })

            // Create audit log
            const { createAuditLog } = await import("@/lib/audit-log")
            await createAuditLog({
                action: "RECOVERY_EMAIL_REMOVED",
                resource: "User",
                resourceId: ctx.userId!,
                userId: ctx.userId!,
            })

            return { success: true }
        }),

    // ========== PASSKEY (Passwordless) AUTHENTICATION ==========

    // Generate passkey registration options
    generatePasskeyRegistrationOptions: baseProcedure
        .use(async ({ ctx, next }) => {
            if (!ctx.userId) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "You must be logged in to create a passkey",
                });
            }
            return next({ ctx });
        })
        .mutation(async ({ ctx }) => {
            const user = await prisma.user.findUnique({
                where: { id: ctx.userId! },
                include: { passkeyCredentials: true },
            })

            if (!user) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User not found",
                });
            }

            const { generateWebAuthnRegistrationOptions } = await import("@/lib/webauthn")
            
            const existingCredentials = user.passkeyCredentials.map((cred) => ({
                credentialID: cred.credentialId,
                publicKey: cred.publicKey,
                counter: Number(cred.counter),
                deviceType: cred.deviceType as "singleDevice" | "multiDevice" | undefined,
                backedUp: cred.backedUp,
                transports: cred.transports ? JSON.parse(cred.transports) : undefined,
            }))

            // Get origin from headers
            const headersList = await headers()
            const origin = headersList.get("origin") || headersList.get("referer") || undefined

            const { options, challenge } = await generateWebAuthnRegistrationOptions(
                user.id,
                user.email,
                user.name,
                existingCredentials,
                origin
            )

            // Store challenge in memory (you might want to use Redis in production)
            if (!globalWithPasskeys.passkeyRegistrationChallenges) {
                globalWithPasskeys.passkeyRegistrationChallenges = new Map()
            }
            globalWithPasskeys.passkeyRegistrationChallenges.set(user.id, challenge)

            return { options }
        }),

    // Verify passkey registration
    verifyPasskeyRegistration: baseProcedure
        .use(async ({ ctx, next }) => {
            if (!ctx.userId) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "You must be logged in to create a passkey",
                });
            }
            return next({ ctx });
        })
        .input(z.object({
            response: z.unknown(),
            name: z.string().min(1, "Please provide a name for this passkey"),
        }))
        .mutation(async ({ input, ctx }) => {
            const challengeStore = globalWithPasskeys.passkeyRegistrationChallenges || new Map()
            const expectedChallenge = challengeStore.get(ctx.userId!)
            challengeStore.delete(ctx.userId!)

            if (!expectedChallenge) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Registration challenge not found or expired",
                });
            }

            const { verifyWebAuthnRegistration } = await import("@/lib/webauthn")
            
            // Get origin from headers
            const headersList = await headers()
            const origin = headersList.get("origin") || headersList.get("referer") || undefined
            
            const response = input.response as RegistrationResponseJSON
            const result = await verifyWebAuthnRegistration(response, expectedChallenge, origin)

            if (!result.verified || !result.credential) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: result.error || "Passkey registration verification failed",
                });
            }

            // Save passkey credential to database
            await prisma.passkeyCredential.create({
                data: {
                    userId: ctx.userId!,
                    name: input.name,
                    credentialId: result.credential.credentialID,
                    publicKey: result.credential.publicKey,
                    counter: BigInt(result.credential.counter),
                    deviceType: result.credential.deviceType,
                    backedUp: result.credential.backedUp,
                    transports: result.credential.transports ? JSON.stringify(result.credential.transports) : null,
                },
            })

            // Create audit log
            const { createAuditLog } = await import("@/lib/audit-log")
            await createAuditLog({
                action: "PASSKEY_REGISTERED",
                resource: "User",
                resourceId: ctx.userId!,
                details: { name: input.name },
                userId: ctx.userId!,
            })

            return { success: true }
        }),

    // Generate passkey authentication options (for login)
    generatePasskeyAuthenticationOptions: baseProcedure
        .input(z.object({
            email: z.string().email("Invalid email address"),
        }))
        .mutation(async ({ input, ctx }) => {
            // Get companyId from subdomain if available
            let companyId: string | undefined = undefined
            if (ctx.subdomain) {
                const company = await prisma.company.findUnique({
                    where: { subdomain: ctx.subdomain },
                    select: { id: true },
                })
                if (company) {
                    companyId = company.id
                }
            }

            const user = await prisma.user.findFirst({
                where: {
                    email: input.email,
                    companyId: companyId || undefined,
                },
                include: { passkeyCredentials: true },
            })

            if (!user || user.passkeyCredentials.length === 0) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "No passkeys found for this account",
                });
            }

            const { generateWebAuthnAuthenticationOptions } = await import("@/lib/webauthn")

            // Get origin from headers
            const headersList = await headers()
            const origin = headersList.get("origin") || headersList.get("referer") || undefined

            // Use discoverable credentials (empty array) to let browser find any passkey
            // This is more reliable than specifying credential IDs which may have encoding issues
            const { options, challenge } = await generateWebAuthnAuthenticationOptions([], origin)

            // Store challenge and userId for verification
            if (!globalWithPasskeys.passkeyAuthenticationChallenges) {
                globalWithPasskeys.passkeyAuthenticationChallenges = new Map()
            }
            globalWithPasskeys.passkeyAuthenticationChallenges.set(input.email, {
                challenge,
                userId: user.id,
            })

            return { options }
        }),

    // Verify passkey authentication and log in
    verifyPasskeyAuthentication: baseProcedure
        .input(z.object({
            email: z.string().email("Invalid email address"),
            response: z.unknown(),
        }))
        .mutation(async ({ input, ctx }) => {
            const challengeStore = globalWithPasskeys.passkeyAuthenticationChallenges || new Map()
            const storedData = challengeStore.get(input.email)
            challengeStore.delete(input.email)

            if (!storedData) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Authentication challenge not found or expired",
                });
            }

            // Get companyId from subdomain if available
            let companyId: string | undefined = undefined
            if (ctx.subdomain) {
                const company = await prisma.company.findUnique({
                    where: { subdomain: ctx.subdomain },
                    select: { id: true },
                })
                if (company) {
                    companyId = company.id
                }
            }

            const user = await prisma.user.findFirst({
                where: {
                    id: storedData.userId,
                    email: input.email,
                    companyId: companyId || undefined,
                },
                include: { passkeyCredentials: true },
            })

            if (!user) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User not found",
                });
            }

            // Check if user is active
            if (!user.isActive) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Your account has been deactivated. Please contact your administrator.",
                });
            }

            // Find the credential being used
            const response = input.response as AuthenticationResponseJSON
            const credentialId = response.id
            
            // Try to find credential with exact match first
            let credential = user.passkeyCredentials.find((c) => c.credentialId === credentialId)
            
            // If not found, there might be a Base64 encoding mismatch
            // The stored ID might be double-encoded, so try decoding it first
            if (!credential) {
                credential = user.passkeyCredentials.find((c) => {
                    try {
                        // Decode the stored credential ID from Base64URL
                        const decodedStored = Buffer.from(c.credentialId, "base64url").toString("utf-8")
                        return decodedStored === credentialId
                    } catch {
                        return false
                    }
                })
            }
            
            // Also try matching rawId if provided
            if (!credential && response.rawId) {
                credential = user.passkeyCredentials.find((c) => c.credentialId === response.rawId)
            }

            if (!credential) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Passkey not found",
                });
            }

            const { verifyWebAuthnAuthentication } = await import("@/lib/webauthn")
            const credentialData = {
                credentialID: credential.credentialId,
                publicKey: credential.publicKey,
                counter: Number(credential.counter),
                deviceType: credential.deviceType as "singleDevice" | "multiDevice" | undefined,
                backedUp: credential.backedUp,
                transports: credential.transports ? JSON.parse(credential.transports) : undefined,
            }

            // Get origin from headers
            const headersList = await headers()
            const origin = headersList.get("origin") || headersList.get("referer") || undefined

            const verification = await verifyWebAuthnAuthentication(
                response,
                storedData.challenge,
                credentialData,
                origin
            )

            if (!verification.verified) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: verification.error || "Passkey verification failed",
                });
            }

            // Update credential counter and last used
            await prisma.passkeyCredential.update({
                where: { id: credential.id },
                data: {
                    counter: BigInt(verification.newCounter || credential.counter),
                    lastUsedAt: new Date(),
                },
            })

            // Update user last login
            await prisma.user.update({
                where: { id: user.id },
                data: { lastLoginAt: new Date() },
            })

            // Create audit log (reuse headersList from above)
            const ipAddress = headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || null
            const userAgent = headersList.get("user-agent") || null

            const { createAuditLog } = await import("@/lib/audit-log")
            await createAuditLog({
                action: "LOGIN_PASSKEY",
                resource: "User",
                resourceId: user.id,
                userId: user.id,
                ipAddress,
                userAgent,
                details: { passkeyName: credential.name },
            })

            // Create session
            await createSession(user.id, user.email, {
                ipAddress,
                userAgent,
            })

            return {
                success: true,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                },
            }
        }),

    // Get user's passkeys
    getUserPasskeys: baseProcedure
        .use(async ({ ctx, next }) => {
            if (!ctx.userId) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "You must be logged in",
                });
            }
            return next({ ctx });
        })
        .query(async ({ ctx }) => {
            const passkeys = await prisma.passkeyCredential.findMany({
                where: { userId: ctx.userId! },
                select: {
                    id: true,
                    name: true,
                    createdAt: true,
                    lastUsedAt: true,
                    deviceType: true,
                    backedUp: true,
                },
                orderBy: { createdAt: "desc" },
            })

            return { passkeys }
        }),

    // Delete a passkey
    deletePasskey: baseProcedure
        .use(async ({ ctx, next }) => {
            if (!ctx.userId) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "You must be logged in",
                });
            }
            return next({ ctx });
        })
        .input(z.object({
            passkeyId: z.string(),
        }))
        .mutation(async ({ input, ctx }) => {
            const passkey = await prisma.passkeyCredential.findUnique({
                where: { id: input.passkeyId },
            })

            if (!passkey || passkey.userId !== ctx.userId!) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Passkey not found",
                });
            }

            await prisma.passkeyCredential.delete({
                where: { id: input.passkeyId },
            })

            // Create audit log
            const { createAuditLog } = await import("@/lib/audit-log")
            await createAuditLog({
                action: "PASSKEY_DELETED",
                resource: "User",
                resourceId: ctx.userId!,
                details: { name: passkey.name },
                userId: ctx.userId!,
            })

            return { success: true }
        }),
});
