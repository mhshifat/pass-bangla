import prisma from "@/lib/prisma";
import { baseProcedure, createTRPCRouter, protectedProcedure } from "@/trpc/init";
import z from "zod";
import { hashPassword } from "@/lib/auth";
import { createSession, destroySession } from "@/lib/session";
import { TRPCError } from "@trpc/server";
import { decrypt } from "@/lib/crypto";
import { getRequestMetadata } from "@/lib/audit-log";
import { headers, cookies } from "next/headers";
import { after } from "next/server";
import { ensureSystemRolesExist } from "./system-roles";
import { authenticateWithPassword, enforceAccessRules, createExtensionSession, runAfter, createVerifiedSession, requireSession, requireUser, getMfaSecret } from "./login-helpers";
import { SignJWT } from "jose";
import { setSignedCookie, takeSignedCookie } from "@/lib/signed-cookie";
import { getSetting, getSettings } from "@/lib/settings-cache";
import { createAuditLog } from "@/lib/audit-log";
import { generateMfaCode, storeMfaCode, verifyMfaCode } from "@/lib/mfa-codes";
import { getThreatDetectionConfig, detectAnomalies, checkRateLimit } from "@/lib/threat-detection";
import { createGeoResolver, checkSuspiciousLocation } from "@/lib/ip-whitelist";
import { generateClientDeviceFingerprint, isDeviceTrusted } from "@/lib/device-fingerprint";
import { shouldEnforceMfa, determineMfaRequirement } from "@/lib/mfa-enforcement";
import { parseUserAgent } from "@/lib/device-parser";
import { getEnabledOAuthProviders, redeemHandoffToken } from "@/lib/oauth";

const LOGIN_SETTING_KEYS = [
    "security.session.timeout_minutes",
    "security.device.require_mfa_untrusted",
    "security.vpn_detection_enabled",
    "security.suspicious_location_alerts_enabled",
] as const;
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@/lib/webauthn";

// WebAuthn challenges live in short-lived signed httpOnly cookies, so they work across serverless instances
const WEBAUTHN_REG_COOKIE = "pb_wa_reg"
const WEBAUTHN_AUTH_COOKIE = "pb_wa_auth"
const PASSKEY_REG_COOKIE = "pb_pk_reg"
const PASSKEY_AUTH_COOKIE = "pb_pk_auth"
const CHALLENGE_TTL_SECONDS = 300

/** Read and clear a challenge cookie; the challenge only counts when issued to this user. */
async function takeChallenge(cookieName: string, userId: string): Promise<string | undefined> {
    const stored = await takeSignedCookie<{ userId: string; challenge: string }>(cookieName)
    return stored && stored.userId === userId ? stored.challenge : undefined
}

/**
 * Rate limit an unauthenticated recovery action per IP and, when given, per target email.
 * Both counters are bumped on every call regardless of whether the account exists, so the
 * outcome never depends on account existence.
 */
async function enforceRecoveryRateLimit(action: string, email?: string) {
    const threatConfig = await getThreatDetectionConfig()
    if (!threatConfig.enabled || !threatConfig.rateLimiting.enabled) return

    const limit = threatConfig.rateLimiting.passwordReset
    const { ipAddress } = getRequestMetadata(await headers())
    const checks = await Promise.all([
        ipAddress ? checkRateLimit(ipAddress, "IP", action, limit) : null,
        email ? checkRateLimit(email.trim().toLowerCase(), "USER", `${action}:email`, limit) : null,
    ])
    const exceeded = checks.find((check) => check?.exceeded)
    if (exceeded) {
        throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Too many attempts. Please try again after ${exceeded.resetAt.toLocaleTimeString()}.`,
        })
    }
}

type WebAuthnDeviceType ="singleDevice" | "multiDevice" | null

function normalizeWebAuthnDeviceType(value: string | null): WebAuthnDeviceType {
    if (value === "singleDevice" || value === "multiDevice") {
        return value
    }
    return null
}

export const authRouter = createTRPCRouter({
    /**
     * Verify if a company exists by name or subdomain
     * Used on main domain login to redirect to subdomain
     */
    verifyCompany: baseProcedure
        .input(
            z.object({
                company: z.string().min(1, "Company name is required"),
            })
        )
        .mutation(async ({ input }) => {
            const normalizedCompany = input.company.trim().toLowerCase()
            
            // Find company by subdomain OR name
            const company = await prisma.company.findFirst({
                where: {
                    OR: [
                        { subdomain: normalizedCompany },
                        { name: { equals: input.company.trim(), mode: "insensitive" } },
                    ]
                },
                select: {
                    id: true,
                    name: true,
                    subdomain: true,
                },
            })

            if (!company) {
                return {
                    exists: false,
                    subdomain: null,
                    name: null,
                }
            }

            return {
                exists: true,
                subdomain: company.subdomain,
                name: company.name,
            }
        }),

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

            // Company, email and password-policy checks are independent, so run them together
            const { validatePassword } = await import("@/lib/password-validation");
            const [existingCompany, existingUser, validation] = await Promise.all([
                prisma.company.findUnique({ where: { subdomain }, select: { id: true } }),
                // Email should be unique per company, but registration checks globally
                prisma.user.findFirst({ where: { email: input.email }, select: { id: true } }),
                validatePassword(input.password),
            ]);

            if (existingCompany) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "A company with this name already exists. Please choose a different name.",
                });
            }

            if (existingUser) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "User with this email already exists",
                });
            }

            if (!validation.isValid) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: validation.errors.join(". "),
                });
            }

            // Hash password while the system roles are checked
            const role = "SUPER_ADMIN";
            const [hashedPassword] = await Promise.all([
                hashPassword(input.password),
                // Seeds the global system roles only when they are missing (no-op after the first signup)
                ensureSystemRolesExist(),
            ]);

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
                    mfaEnabled: false, // MFA enabled by default - user must set it up
                },
            });

            // Get base URL for verification link
            const headersList = await headers();
            const protocol = headersList.get("x-forwarded-proto") || "http";
            const host = headersList.get("host") || "localhost:3000";
            const baseUrl = `${protocol}://${host}`;

            // The email is sent after the response; the user can resend it from the verify page
            after(async () => {
                try {
                    const { createVerificationToken, sendVerificationEmail } = await import("@/lib/email-verification");
                    const token = await createVerificationToken(user.id, user.email);
                    await sendVerificationEmail(user.id, user.email, token, baseUrl);
                } catch (error) {
                    console.error("Failed to send verification email after registration:", error);
                }
            });

            // Get request metadata (IP and user agent)
            const { ipAddress, userAgent } = getRequestMetadata(headersList);

            // Create session with device info
            // Set mfaSetupRequired to true for new registrations - user must set up MFA
            await createSession(user.id, user.email, {
                ipAddress,
                userAgent,
                companyId: company.id,
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

    // Finish a Google / GitHub sign-up: the provider already confirmed the email,
    // the user only chooses their name and company.
    completeOAuthSignup: baseProcedure
        .input(
            z.object({
                name: z.string().min(2, "Name must be at least 2 characters"),
                companyName: z.string().min(2, "Company name must be at least 2 characters").regex(/^[a-z0-9-]+$/, "Company name can only contain lowercase letters, numbers, and hyphens"),
            })
        )
        .mutation(async ({ input, ctx }) => {
            if (ctx.subdomain) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Registration is only available on the main domain",
                });
            }

            const {
                OAUTH_SIGNUP_COOKIE,
                verifyPendingSignup,
                linkOAuthAccount,
                createHandoffToken,
                getRequestOrigin,
                finishUrl,
            } = await import("@/lib/oauth");

            const cookieStore = await cookies();
            const pending = await verifyPendingSignup(cookieStore.get(OAUTH_SIGNUP_COOKIE)?.value);
            if (!pending) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Your sign-up session has expired. Please start again.",
                });
            }

            const subdomain = input.companyName.toLowerCase().trim().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
            if (subdomain.length < 2) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Company name must contain at least 2 valid characters",
                });
            }

            const existingCompany = await prisma.company.findUnique({
                where: { subdomain },
            });
            if (existingCompany) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "A company with this name already exists. Please choose a different name.",
                });
            }

            const existingUser = await prisma.user.findFirst({
                where: { email: { equals: pending.email, mode: "insensitive" } },
            });
            if (existingUser) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "User with this email already exists",
                });
            }

            // Same role setup as the password registration
            const role = "SUPER_ADMIN";
            await ensureSystemRolesExist();

            const company = await prisma.company.create({
                data: {
                    name: input.companyName,
                    subdomain,
                },
            });

            const user = await prisma.user.create({
                data: {
                    name: input.name,
                    email: pending.email,
                    password: null, // Signs in through the provider
                    role,
                    companyId: company.id,
                    emailVerified: new Date(), // Verified by the provider
                    mfaEnabled: false,
                },
            });

            await linkOAuthAccount(user.id, pending.provider, pending.providerAccountId);

            const headersList = await headers();
            const { ipAddress, userAgent } = getRequestMetadata(headersList);
            await createAuditLog({
                action: "USER_REGISTERED_OAUTH",
                resource: "User",
                resourceId: user.id,
                userId: user.id,
                companyId: company.id,
                ipAddress,
                userAgent,
                details: { provider: pending.provider },
            });

            cookieStore.delete(OAUTH_SIGNUP_COOKIE);

            // The session is created on the company's own address
            const token = await createHandoffToken(user.id, company.id, pending.provider);
            return {
                success: true,
                redirectUrl: finishUrl(getRequestOrigin(headersList), company.subdomain, token),
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

            const threatConfig = await getThreatDetectionConfig(company.id)
            const user = await authenticateWithPassword({
                companyId: company.id,
                email: input.email,
                password: input.password,
                captchaToken: input.captchaToken,
                captchaAnswer: input.captchaAnswer,
                ipAddress,
                threatConfig,
                issueCaptchaChallenge: true,
            })

            // The location is resolved at most once for this login and shared by every check
            const resolveGeo = createGeoResolver(ipAddress ?? "")
            const [settings, deviceIsTrusted] = await Promise.all([
                getSettings(LOGIN_SETTING_KEYS, company.id),
                isDeviceTrusted(generateClientDeviceFingerprint(userAgent, ipAddress), user.id),
                // IP allow-list and geographic restrictions apply to MFA users too, before any session exists
                enforceAccessRules({ user, ipAddress, userAgent, resolveGeo }),
            ]);

            const sessionOptions = {
                ipAddress,
                userAgent,
                companyId: user.companyId,
                deviceIsTrusted,
                timeoutMinutes: settings.get("security.session.timeout_minutes") as number | undefined,
                requireMfaForUntrustedDevices: settings.get("security.device.require_mfa_untrusted") === true,
            };

            const hasMfaMethod =
                (user.mfaMethod === "TOTP" && user.mfaSecret !== null) ||
                (user.mfaMethod === "SMS" && user.phoneNumber !== null) ||
                (user.mfaMethod === "EMAIL" && user.email !== null) ||
                (user.mfaMethod === "WEBAUTHN" && user._count.mfaCredentials > 0);

            // MFA is enabled: require setup or verification
            if (user.mfaEnabled) {
                if (!hasMfaMethod) {
                    await createSession(user.id, user.email, { ...sessionOptions, mfaVerified: false, mfaSetupRequired: true });
                    return { success: true, mfaSetupRequired: true };
                }
                await createSession(user.id, user.email, { ...sessionOptions, mfaVerified: false, mfaRequired: true });
                return { success: true, mfaRequired: true };
            }

            // If the device is untrusted and device MFA is on, enforce MFA regardless of other settings
            if (sessionOptions.requireMfaForUntrustedDevices && !deviceIsTrusted) {
                if (hasMfaMethod) {
                    await createSession(user.id, user.email, { ...sessionOptions, mfaVerified: false, mfaRequired: true });
                    return { success: true, mfaRequired: true, deviceRequiresMfa: true };
                }
                await createSession(user.id, user.email, {
                    ...sessionOptions,
                    mfaVerified: false,
                    mfaSetupRequired: true,
                    mfaRequired: false,
                });
                return { success: true, mfaSetupRequired: true, deviceRequiresMfa: true };
            }

            // MFA enforced by global settings or role
            if (await shouldEnforceMfa(user.id, user.role, user.mfaEnabled, company.id)) {
                const mfaRequirement = await determineMfaRequirement(user.id, user.role, user.mfaEnabled, hasMfaMethod, company.id)

                if (mfaRequirement.mfaSetupRequired) {
                    await createSession(user.id, user.email, {
                        ...sessionOptions,
                        mfaVerified: false,
                        mfaSetupRequired: true,
                        mfaRequired: false,
                    });
                    return { success: true, mfaSetupRequired: true };
                } else if (mfaRequirement.mfaRequired) {
                    await createSession(user.id, user.email, { ...sessionOptions, mfaVerified: false, mfaRequired: true });
                    return { success: true, mfaRequired: true };
                }
            }

            await createSession(user.id, user.email, sessionOptions);

            // Bookkeeping that nothing in this response depends on runs after it is sent
            const vpnDetectionEnabled = settings.get("security.vpn_detection_enabled") === true
            const suspiciousAlertsEnabled = settings.get("security.suspicious_location_alerts_enabled") === true
            await runAfter(async () => {
                let geo: Awaited<ReturnType<typeof resolveGeo>> = null
                try {
                    const [resolved] = await Promise.all([
                        ipAddress ? resolveGeo() : null,
                        prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
                    ])
                    geo = resolved

                    // Anomaly detection compares with earlier logins, so it runs before this one is recorded
                    if (threatConfig.enabled && threatConfig.anomalyDetection.enabled) {
                        const anomalyCheck = await detectAnomalies(
                            user.id,
                            ipAddress,
                            userAgent,
                            threatConfig.anomalyDetection,
                            company.id,
                            resolveGeo
                        )
                        // The threat event has already been created by detectAnomalies; the login is not blocked
                        if (anomalyCheck.isAnomaly) {
                            console.warn(`[Threat Detection] Anomaly detected for user ${user.id}:`, anomalyCheck.reasons)
                        }
                    }

                    if (ipAddress && (vpnDetectionEnabled || suspiciousAlertsEnabled)) {
                        const suspiciousCheck = await checkSuspiciousLocation(ipAddress, user.id, resolveGeo)
                        const suspiciousGeo = suspiciousCheck.geo as
                            | { isVpn?: boolean; isProxy?: boolean; country?: string; countryCode?: string }
                            | undefined

                        if (vpnDetectionEnabled && suspiciousGeo && (suspiciousGeo.isVpn || suspiciousGeo.isProxy)) {
                            await createAuditLog({
                                action: "LOGIN_VPN_DETECTED",
                                resource: "User",
                                resourceId: user.id,
                                userId: user.id,
                                ipAddress,
                                userAgent,
                                status: "WARNING",
                                details: {
                                    isVpn: suspiciousGeo.isVpn || false,
                                    isProxy: suspiciousGeo.isProxy || false,
                                    country: suspiciousGeo.country || null,
                                },
                            })
                        }

                        // The login is allowed; the suspicious location is only logged
                        if (suspiciousAlertsEnabled && suspiciousCheck.suspicious && suspiciousGeo) {
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
                                    country: suspiciousGeo.country || null,
                                    countryCode: suspiciousGeo.countryCode || null,
                                },
                            })
                        }
                    }
                } finally {
                    // The country is stored so later logins can be compared without another lookup
                    await createAuditLog(
                        {
                            action: "LOGIN_SUCCESS",
                            resource: "User",
                            resourceId: user.id,
                            userId: user.id,
                            ipAddress,
                            userAgent,
                            details: geo?.countryCode ? { countryCode: geo.countryCode, country: geo.country ?? null } : undefined,
                        },
                        { sync: true }
                    )
                }
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

            const threatConfig = await getThreatDetectionConfig(company.id);
            const user = await authenticateWithPassword({
                companyId: company.id,
                email: input.email,
                password: input.password,
                captchaToken: input.captchaToken,
                captchaAnswer: input.captchaAnswer,
                ipAddress,
                threatConfig,
                issueCaptchaChallenge: false,
            });

            const resolveGeo = createGeoResolver(ipAddress ?? "");
            const deviceFingerprint = generateClientDeviceFingerprint(userAgent, ipAddress);
            const [settings, deviceIsTrusted] = await Promise.all([
                getSettings(LOGIN_SETTING_KEYS, company.id),
                isDeviceTrusted(deviceFingerprint, user.id),
                enforceAccessRules({ user, ipAddress, userAgent, resolveGeo, source: "extension" }),
            ]);

            const timeoutMinutes = (settings.get("security.session.timeout_minutes") as number | undefined) ?? 30;

            // Check if device-specific MFA is required
            const deviceRequiresMfa = settings.get("security.device.require_mfa_untrusted") === true && !deviceIsTrusted;

            // MFA is required if device requires it OR if enforced by settings
            const enforceMfa = await shouldEnforceMfa(user.id, user.role, user.mfaEnabled, company.id)
            const finalMfaRequired = deviceRequiresMfa || enforceMfa;

            // When MFA is required, a PENDING token (mfaVerified:false) is issued.
            // The extension must complete extensionVerifyMfa to obtain a verified
            // token before it can access protected data (enforced server-side).
            const { sessionToken, maxAge } = await createExtensionSession({
                userId: user.id,
                email: user.email,
                companyId: user.companyId || null,
                timeoutMinutes,
                mfaRequired: finalMfaRequired,
                ipAddress,
                userAgent,
                deviceFingerprint,
                deviceIsTrusted,
            });

            // Also set the cookie (for web browser compatibility)
            const cookieStore = await cookies();
            cookieStore.set("session", sessionToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                maxAge,
                path: "/",
            });

            await runAfter(async () => {
                const geo = ipAddress ? await resolveGeo() : null
                await createAuditLog(
                    {
                        action: "LOGIN_SUCCESS",
                        resource: "User",
                        resourceId: user.id,
                        userId: user.id,
                        ipAddress: ipAddress || null,
                        userAgent: userAgent || null,
                        details: { source: "extension", ...(geo?.countryCode ? { countryCode: geo.countryCode, country: geo.country ?? null } : {}) },
                    },
                    { sync: true }
                )
            });

            return {
                success: true,
                // If true, the extension must call extensionVerifyMfa with a code
                // before the token grants access to protected data.
                mfaRequired: finalMfaRequired,
                mfaMethod: finalMfaRequired ? (user.mfaMethod || "TOTP") : null,
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

    /** Which social sign-in buttons the extension may show (providers with credentials configured) */
    getOAuthProviders: baseProcedure.query(() => ({ providers: getEnabledOAuthProviders() })),

    /**
     * Extension social sign-in, last step. The handoff token minted by the OAuth
     * callback only proves WHO signed in; every access rule and the MFA decision
     * run again here, with the same outcome shape as extensionLogin.
     */
    extensionOAuthExchange: baseProcedure
        .input(z.object({ token: z.string().min(1).max(4096) }))
        .mutation(async ({ input }) => {
            const { ipAddress, userAgent } = getRequestMetadata(await headers());

            // Single use, and only tokens minted for the extension redeem here
            const handoff = await redeemHandoffToken(input.token, "extension");
            if (!handoff) {
                throw new TRPCError({ code: "UNAUTHORIZED", message: "This sign-in link expired. Please try again." });
            }

            const user = await prisma.user.findUnique({
                where: { id: handoff.userId },
                include: {
                    company: { select: { id: true, name: true, subdomain: true } },
                    _count: { select: { mfaCredentials: true } },
                },
            });
            if (!user || !user.company) {
                throw new TRPCError({ code: "UNAUTHORIZED", message: "This sign-in link expired. Please try again." });
            }
            if (!user.isActive) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Your account has been deactivated. Please contact your administrator.",
                });
            }
            const company = user.company;

            const resolveGeo = createGeoResolver(ipAddress ?? "");
            const deviceFingerprint = generateClientDeviceFingerprint(userAgent, ipAddress);
            const [settings, deviceIsTrusted] = await Promise.all([
                getSettings(LOGIN_SETTING_KEYS, company.id),
                isDeviceTrusted(deviceFingerprint, user.id),
                enforceAccessRules({ user, ipAddress, userAgent, resolveGeo, source: "extension" }),
            ]);

            // The provider only releases verified addresses, so the email is proven
            if (!user.emailVerified) {
                await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
            }

            const hasMfaMethod =
                (user.mfaMethod === "TOTP" && user.mfaSecret !== null) ||
                (user.mfaMethod === "SMS" && user.phoneNumber !== null) ||
                (user.mfaMethod === "EMAIL" && user.email !== null) ||
                (user.mfaMethod === "WEBAUTHN" && user._count.mfaCredentials > 0);

            const deviceRequiresMfa = settings.get("security.device.require_mfa_untrusted") === true && !deviceIsTrusted;
            const enforceMfa = await shouldEnforceMfa(user.id, user.role, user.mfaEnabled, company.id);
            const finalMfaRequired = deviceRequiresMfa || enforceMfa;

            const userInfo = { id: user.id, name: user.name, email: user.email, role: user.role };

            // MFA is mandatory but nothing is set up: no session until it is configured in the web app
            if (finalMfaRequired && !hasMfaMethod) {
                return {
                    success: true,
                    mfaRequired: false,
                    mfaSetupRequired: true,
                    mfaMethod: null,
                    user: userInfo,
                    company,
                    sessionToken: undefined,
                };
            }

            const timeoutMinutes = (settings.get("security.session.timeout_minutes") as number | undefined) ?? 30;
            const { sessionToken } = await createExtensionSession({
                userId: user.id,
                email: user.email,
                companyId: user.companyId || null,
                timeoutMinutes,
                mfaRequired: finalMfaRequired,
                ipAddress,
                userAgent,
                deviceFingerprint,
                deviceIsTrusted,
            });

            if (!finalMfaRequired) {
                await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
            }

            await runAfter(async () => {
                await createAuditLog(
                    {
                        action: "LOGIN_OAUTH",
                        resource: "User",
                        resourceId: user.id,
                        userId: user.id,
                        ipAddress: ipAddress || null,
                        userAgent: userAgent || null,
                        details: { provider: handoff.provider, client: "extension", ...(finalMfaRequired ? { mfaPending: true } : {}) },
                    },
                    { sync: true }
                );
            });

            return {
                success: true,
                mfaRequired: finalMfaRequired,
                mfaSetupRequired: false,
                mfaMethod: finalMfaRequired ? (user.mfaMethod || "TOTP") : null,
                user: userInfo,
                company,
                sessionToken,
            };
        }),

    /**
     * Extension MFA: send an SMS/EMAIL code for the pending (mfaVerified:false)
     * extension session. Identifies the user from the x-session-token header
     * (ctx.userId), so it works without a browser cookie.
     */
    extensionSendMfaCode: baseProcedure
        .input(z.object({ method: z.enum(["SMS", "EMAIL"]) }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.userId) {
                throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
            }
            const user = ctx.user
            if (!user) {
                throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
            }

            const code = generateMfaCode()

            if (input.method === "SMS") {
                if (!user.phoneNumber) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "Phone number not set on your account." });
                }
                const { checkSmsCredentials, sendSmsCode } = await import("@/lib/sms")
                const credentialsCheck = await checkSmsCredentials(ctx.companyId)
                if (!credentialsCheck.configured) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: credentialsCheck.error || "SMS is not configured." });
                }
                await storeMfaCode(user.id, "SMS", code)
                const result = await sendSmsCode(user.phoneNumber, code, ctx.companyId)
                if (!result.success) {
                    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error || "Failed to send SMS code" });
                }
            } else {
                if (!user.email) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "Email not found" });
                }
                await storeMfaCode(user.id, "EMAIL", code)
                const { sendEmail } = await import("@/lib/mailer")
                const { renderEmailLayout, emailCodeBlock, APP_NAME } = await import("@/lib/email-template")
                const result = await sendEmail({
                    to: user.email,
                    subject: `Your ${APP_NAME} verification code`,
                    html: renderEmailLayout({
                        title: `Your ${APP_NAME} verification code`,
                        heading: "Verification code",
                        preview: "Your one-time verification code.",
                        bodyHtml: `
                            <p style="margin: 0 0 8px;">Use the verification code below to sign in to the browser extension:</p>
                            ${emailCodeBlock(code)}
                            <p style="font-size: 14px; color: #737373; margin: 0;">
                                This code will expire in 10 minutes. If you didn't request it, you can safely ignore this email.
                            </p>
                        `,
                    }),
                    text: `Your ${APP_NAME} verification code is: ${code}. It expires in 10 minutes.`,
                })
                if (!result.success) {
                    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error || "Failed to send email code" });
                }
            }

            return { success: true };
        }),

    /**
     * Extension MFA: verify a code for the pending extension session and, on
     * success, issue a NEW verified (mfaVerified:true) session token that the
     * extension stores in place of the pending one.
     */
    extensionVerifyMfa: baseProcedure
        .input(z.object({
            code: z.string().min(6).max(6),
            method: z.enum(["TOTP", "SMS", "EMAIL"]).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.userId) {
                throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
            }
            const user = ctx.user
            if (!user) {
                throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
            }

            const method = input.method || user.mfaMethod || "TOTP"

            if (method === "TOTP") {
                const encryptedSecret = await getMfaSecret(user.id)
                if (!encryptedSecret) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "TOTP is not set up on your account." });
                }
                const decryptedSecret = decrypt(encryptedSecret)
                const authenticator = await import("otplib").then(mod => mod.authenticator)
                if (!authenticator.check(input.code, decryptedSecret)) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid MFA code" });
                }
            } else if (method === "SMS" || method === "EMAIL") {
                const isValid = await verifyMfaCode(user.id, method, input.code)
                if (!isValid) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired code" });
                }
            } else {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: `MFA method "${method}" is not supported in the extension. Please use the web app.`,
                });
            }

            // Issue a NEW verified session token (replaces the pending one).
            const { SignJWT } = await import("jose")
            const SESSION_SECRET = process.env.SESSION_SECRET || "default-secret-change-in-production"
            const secret = new TextEncoder().encode(SESSION_SECRET)
            const timeoutMinutes = (await getSetting<number>("security.session.timeout_minutes")) ?? 30
            const maxAge = timeoutMinutes * 60
            const newToken = await new SignJWT({
                userId: user.id,
                email: user.email,
                isLoggedIn: true,
                mfaVerified: true,
                mfaSetupRequired: false,
                mfaRequired: true,
            })
                .setProtectedHeader({ alg: "HS256" })
                .setExpirationTime(`${timeoutMinutes}m`)
                .sign(secret)

            // Swap the pending DB session's token for the verified one (keeps the
            // device metadata from the pending session).
            if (ctx.sessionToken) {
                try {
                    await prisma.session.update({
                        where: { sessionToken: ctx.sessionToken },
                        data: { sessionToken: newToken, lastActiveAt: new Date() },
                    })
                } catch (error) {
                    console.error("Failed to upgrade extension session after MFA:", error)
                }
            }

            // Update the cookie too (web-browser compatibility).
            const cookieStore = await cookies()
            cookieStore.set("session", newToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                maxAge,
                path: "/",
            })

            await createAuditLog({
                action: "MFA_VERIFIED",
                resource: "User",
                resourceId: user.id,
                details: { method, source: "extension" },
                userId: user.id,
            })

            return { success: true, sessionToken: newToken };
        }),

    logout: baseProcedure
        .mutation(async () => {
            await destroySession();
            return { success: true };
        }),
    getCurrentUser: baseProcedure
        .query(async ({ ctx }) => {
            // The context already validated the session and loaded the user in
            // one query, so nothing is re-read here.
            const { session, user: ctxUser } = ctx;

            if (!session || !ctxUser) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "User not found",
                });
            }

            const rest = {
                id: ctxUser.id,
                name: ctxUser.name,
                email: ctxUser.email,
                emailVerified: ctxUser.emailVerified,
                image: ctxUser.image,
                role: ctxUser.role,
                mfaEnabled: ctxUser.mfaEnabled,
                mfaMethod: ctxUser.mfaMethod,
                phoneNumber: ctxUser.phoneNumber,
                createdById: ctxUser.createdById,
            };

            // Determine if MFA verification is needed
            const hasMfaMethod =
                (rest.mfaMethod === "TOTP" && ctxUser.hasTotpSecret) ||
                (rest.mfaMethod === "SMS" && rest.phoneNumber !== null) ||
                (rest.mfaMethod === "EMAIL" && rest.email !== null) ||
                (rest.mfaMethod === "WEBAUTHN" && ctxUser.mfaCredentialCount > 0);

            // Determine MFA requirements
            // Priority: session flag (for device-specific requirements) > enforcement logic
            let mfaSetupRequired = session.mfaSetupRequired === true
            let shouldVerifyMfa = false

            if (!mfaSetupRequired) {
                // Checks whether MFA is enforced (settings are served from the
                // settings cache) and reports no requirement when it is not.
                const { determineMfaRequirement } = await import("@/lib/mfa-enforcement")
                const mfaRequirement = await determineMfaRequirement(rest.id, rest.role, rest.mfaEnabled, hasMfaMethod, ctx.companyId)
                mfaSetupRequired = mfaRequirement.mfaSetupRequired
                shouldVerifyMfa = mfaRequirement.mfaRequired && !session.mfaVerified
            }

            return {
                user: rest,
                session,
                shouldVerifyMfa,
                mfaSetupRequired,
                mfaMethod: rest.mfaMethod,
                permissions: ctx.permissions, // Include permissions from context
            };
        }),
    getCurrentUserPermissions: baseProcedure
        .query(async ({ ctx }) => {
            const { permissions } = ctx;
            return { permissions };
        }),
    generateMfaQr: baseProcedure
        .query(async ({ ctx }) => {
            const session = requireSession(ctx)
            const authenticator = await import("otplib").then(mod => mod.authenticator)
            const qrcode = await import("qrcode").then(mod => mod.default)
            const { encrypt } = await import("@/lib/crypto")
            
            const user = ctx.user
            
            let secret: string

            // Only return existing secret if MFA is already fully enabled and configured
            // If MFA is not enabled yet (setup in progress), always regenerate and save a new secret
            const existingSecret = user?.mfaEnabled && user.hasTotpSecret ? await getMfaSecret(session.userId) : null
            if (existingSecret) {
                // User has MFA enabled - use existing secret
                secret = decrypt(existingSecret)
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
        .mutation(async ({ input, ctx }) => {
            const session = requireSession(ctx)
            const user = requireUser(ctx)

            const method = input.method || user.mfaMethod || "TOTP"

            // Check if credentials are configured for the selected method
            if (method === "SMS") {
                const { checkSmsCredentials } = await import("@/lib/sms")
                const credentialsCheck = await checkSmsCredentials(ctx.companyId)
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
                const credentialsCheck = await checkWebAuthnCredentials(ctx.companyId)
                if (!credentialsCheck.configured) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: credentialsCheck.error || "WebAuthn credentials are not configured. Please configure them in Settings → MFA Credentials before enabling WebAuthn MFA.",
                    });
                }
            }

            // Verify based on method
            if (method === "TOTP") {
                const encryptedSecret = await getMfaSecret(user.id)
                if (!encryptedSecret) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "No MFA secret found",
                    });
                }
                const decryptedSecret = decrypt(encryptedSecret)
                const authenticator = await import("otplib").then(mod => mod.authenticator)
                const isValid = authenticator.check(input.code, decryptedSecret)
                if (!isValid) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Invalid MFA code",
                    });
                }
            } else if (method === "SMS") {
                const isValid = await verifyMfaCode(user.id, "SMS", input.code)
                if (!isValid) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Invalid or expired SMS code",
                    });
                }
            } else if (method === "EMAIL") {
                const isValid = await verifyMfaCode(user.id, "EMAIL", input.code)
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
            await createAuditLog({
                action: "MFA_SETUP",
                resource: "User",
                resourceId: session.userId,
                details: { method },
                userId: session.userId,
            });
            await createVerifiedSession(user.id, user.email);
            return { success: true };
        }),
    disableMfa: baseProcedure
        .mutation(async ({ ctx }) => {
            const session = requireSession(ctx)
            
            const user = requireUser(ctx)

            // Check if MFA is enforced by global settings - prevent disabling if enforced
            const { shouldEnforceMfa } = await import("@/lib/mfa-enforcement")
            const enforceMfa = await shouldEnforceMfa(user.id, user.role, false, ctx.companyId) // Check with mfaEnabled=false
            
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
        .mutation(async ({ input, ctx }) => {
            const session = requireSession(ctx)
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
                const encryptedSecret = input.code ? await getMfaSecret(user.id) : null
                if (!encryptedSecret || !input.code) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "TOTP code is required",
                    });
                }
                const decryptedSecret = decrypt(encryptedSecret);
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
                const credentialsCheck = await checkSmsCredentials(ctx.companyId)
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
                const isValid = await verifyMfaCode(user.id, "SMS", input.code)
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
                const isValid = await verifyMfaCode(user.id, "EMAIL", input.code)
                if (!isValid) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Invalid or expired email code",
                    });
                }
            } else if (method === "WEBAUTHN") {
                // Check if WebAuthn credentials are configured
                const { checkWebAuthnCredentials } = await import("@/lib/webauthn")
                const credentialsCheck = await checkWebAuthnCredentials(ctx.companyId)
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

            await createVerifiedSession(user.id, user.email);
            return { success: true };
        }),

    // SMS MFA
    sendSmsMfaCode: baseProcedure
        .mutation(async ({ ctx }) => {
            requireSession(ctx)
            const user = ctx.user
            if (!user || !user.phoneNumber) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Phone number not set. Please add a phone number to your account.",
                });
            }

            // Check if SMS credentials are configured
            const { checkSmsCredentials } = await import("@/lib/sms")
            const credentialsCheck = await checkSmsCredentials(ctx.companyId)
            if (!credentialsCheck.configured) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: credentialsCheck.error || "SMS credentials are not configured. Please configure them in Settings → MFA Credentials.",
                });
            }

            const { sendSmsCode } = await import("@/lib/sms")
            
            const code = generateMfaCode()
            await storeMfaCode(user.id, "SMS", code)
            
            const result = await sendSmsCode(user.phoneNumber, code, ctx.companyId)
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
        .mutation(async ({ input, ctx }) => {
            requireSession(ctx)
            const user = requireUser(ctx)

            const isValid = await verifyMfaCode(user.id, "SMS", input.code)
            
            if (!isValid) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Invalid or expired SMS code",
                });
            }

            // Create audit logs
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

            await createVerifiedSession(user.id, user.email);
            return { success: true };
        }),

    // Email MFA
    sendEmailMfaCode: baseProcedure
        .mutation(async ({ ctx }) => {
            requireSession(ctx)
            const user = ctx.user
            if (!user || !user.email) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Email not found",
                });
            }

            const { sendEmail } = await import("@/lib/mailer")
            const { renderEmailLayout, emailCodeBlock, APP_NAME } = await import(
                "@/lib/email-template"
            )

            const code = generateMfaCode()
            await storeMfaCode(user.id, "EMAIL", code)

            const result = await sendEmail({
                to: user.email,
                subject: `Your ${APP_NAME} verification code`,
                html: renderEmailLayout({
                    title: `Your ${APP_NAME} verification code`,
                    heading: "Verification code",
                    preview: "Your one-time verification code.",
                    bodyHtml: `
                        <p style="margin: 0 0 8px;">Use the verification code below to continue:</p>
                        ${emailCodeBlock(code)}
                        <p style="font-size: 14px; color: #737373; margin: 0;">
                            This code will expire in 10 minutes. If you didn't request this code, you can safely ignore this email.
                        </p>
                    `,
                }),
                text: `Your ${APP_NAME} verification code is: ${code}. This code will expire in 10 minutes.`,
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
        .mutation(async ({ input, ctx }) => {
            requireSession(ctx)
            const user = requireUser(ctx)

            const isValid = await verifyMfaCode(user.id, "EMAIL", input.code)
            
            if (!isValid) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Invalid or expired email code",
                });
            }

            // Create audit logs
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

            await createVerifiedSession(user.id, user.email);
            return { success: true };
        }),

    // WebAuthn MFA
    generateWebAuthnRegistration: baseProcedure
        .query(async ({ ctx }) => {
            const session = requireSession(ctx)
            const user = requireUser(ctx)
            const mfaCredentials = await prisma.mfaCredential.findMany({ where: { userId: user.id } })

            // Check if WebAuthn credentials are configured
            const { checkWebAuthnCredentials } = await import("@/lib/webauthn")
            const credentialsCheck = await checkWebAuthnCredentials(ctx.companyId)
            if (!credentialsCheck.configured) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: credentialsCheck.error || "WebAuthn credentials are not configured. Please configure them in Settings → MFA Credentials.",
                });
            }

            const { generateWebAuthnRegistrationOptions } = await import("@/lib/webauthn")
            
            const existingCredentials = mfaCredentials.map((cred) => ({
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

            await setSignedCookie(WEBAUTHN_REG_COOKIE, { userId: session.userId, challenge }, CHALLENGE_TTL_SECONDS)

            return { options };
        }),

    verifyWebAuthnRegistration: baseProcedure
        .input(z.object({
            response: z.any(),
        }))
        .mutation(async ({ input, ctx }) => {
            const session = requireSession(ctx)
            const user = requireUser(ctx)

            const expectedChallenge = await takeChallenge(WEBAUTHN_REG_COOKIE, session.userId)

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
        .query(async ({ ctx }) => {
            const session = requireSession(ctx)
            const user = requireUser(ctx)
            const mfaCredentials = await prisma.mfaCredential.findMany({ where: { userId: user.id } })

            if (mfaCredentials.length === 0) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "No WebAuthn credentials found",
                });
            }

            // Check if WebAuthn credentials are configured
            const { checkWebAuthnCredentials } = await import("@/lib/webauthn")
            const credentialsCheck = await checkWebAuthnCredentials(ctx.companyId)
            if (!credentialsCheck.configured) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: credentialsCheck.error || "WebAuthn credentials are not configured. Please configure them in Settings → MFA Credentials.",
                });
            }

            const { generateWebAuthnAuthenticationOptions } = await import("@/lib/webauthn")
            
            const credentials = mfaCredentials.map((cred) => ({
                credentialID: cred.credentialId,
                publicKey: cred.publicKey,
                counter: Number(cred.counter),
                deviceType: normalizeWebAuthnDeviceType(cred.deviceType),
                backedUp: cred.backedUp,
                transports: cred.transports ? JSON.parse(cred.transports) : undefined,
            }))

            const { options, challenge } = await generateWebAuthnAuthenticationOptions(credentials)

            await setSignedCookie(WEBAUTHN_AUTH_COOKIE, { userId: session.userId, challenge }, CHALLENGE_TTL_SECONDS)

            return { options };
        }),

    verifyWebAuthnAuthentication: baseProcedure
        .input(z.object({
            response: z.any(),
        }))
        .mutation(async ({ input, ctx }) => {
            const session = requireSession(ctx)
            const user = requireUser(ctx)
            const mfaCredentials = await prisma.mfaCredential.findMany({ where: { userId: user.id } })

            const expectedChallenge = await takeChallenge(WEBAUTHN_AUTH_COOKIE, session.userId)

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
            const credential = mfaCredentials.find((c) => c.credentialId === credentialId)

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

            await createVerifiedSession(user.id, user.email);
            return { success: true };
        }),

    // Recovery Codes
    generateRecoveryCodes: baseProcedure
        .mutation(async ({ ctx }) => {
            requireSession(ctx)
            const user = requireUser(ctx)

            // Check if recovery codes are enabled
            const recoverySettings = await getSettings(["mfa.recovery_codes_enabled", "mfa.recovery_codes_count"], ctx.companyId)
            if (recoverySettings.get("mfa.recovery_codes_enabled") !== true) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Recovery codes are not enabled",
                });
            }

            // Get count from settings
            const count = (recoverySettings.get("mfa.recovery_codes_count") as number | undefined) || 10

            // Generate new codes
            const { generateRecoveryCodes, hashRecoveryCode } = await import("@/lib/recovery-codes")
            const codes = generateRecoveryCodes(count)

            // Hash (in parallel, off the main thread) without dashes: codes are displayed with dashes but stored without
            const hashedCodes = await Promise.all(
                codes.map((formattedCode) => hashRecoveryCode(formattedCode.replace(/-/g, "").toUpperCase()))
            )

            // Replace the old unused codes with the new ones in one transaction
            await prisma.$transaction([
                prisma.recoveryCode.deleteMany({
                    where: {
                        userId: user.id,
                        used: false,
                    },
                }),
                prisma.recoveryCode.createMany({
                    data: hashedCodes.map((codeHash) => ({ userId: user.id, codeHash })),
                }),
            ])

            // Return plain codes only once (user should save them)
            return { codes };
        }),

    verifyRecoveryCode: baseProcedure
        .input(z.object({
            code: z.string().min(1),
        }))
        .mutation(async ({ input, ctx }) => {
            const session = requireSession(ctx)
            const user = requireUser(ctx)

            const unusedCodes = await prisma.recoveryCode.findMany({
                where: { userId: user.id, used: false },
                select: { id: true, codeHash: true },
            })
            const { verifyRecoveryCode } = await import("@/lib/recovery-codes")

            // Remove dashes from input code for verification
            const normalizedCode = input.code.replace(/-/g, "").toUpperCase()

            // Every unused hash is checked at once instead of one slow compare after another
            const results = await Promise.all(
                unusedCodes.map(async (recoveryCode) => ({
                    id: recoveryCode.id,
                    valid: await verifyRecoveryCode(normalizedCode, recoveryCode.codeHash),
                }))
            )
            const match = results.find((r) => r.valid)

            if (match) {
                // Mark as used; the conditional update makes a code usable only once even when two requests race
                const claimed = await prisma.recoveryCode.updateMany({
                    where: { id: match.id, used: false },
                    data: { used: true, usedAt: new Date() },
                })

                if (claimed.count === 1) {
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

                    await createVerifiedSession(user.id, user.email);
                    return { success: true };
                }
            }

            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Invalid or already used recovery code",
            });
        }),

    listRecoveryCodes: baseProcedure
        .query(async ({ ctx }) => {
            const session = requireSession(ctx)
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
            const adminResetSetting = await getSetting("mfa.admin_reset_enabled", ctx.companyId)
            const adminResetEnabled = adminResetSetting !== undefined ? adminResetSetting === true : true // Default to true if not set
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
            const user = ctx.user;

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
                    company: { select: { subdomain: true } },
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
            await createAuditLog({
                action: "EMAIL_VERIFIED",
                resource: "User",
                resourceId: user.id,
                userId: user.id,
            });

            return {
                success: true,
                // The app lives on the company's subdomain; the client needs it to continue
                companySubdomain: user.company?.subdomain ?? null,
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
            const user = ctx.user;

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

            // Authenticated, but still sends mail: limit per user
            const resendLimit = await getThreatDetectionConfig();
            if (resendLimit.enabled && resendLimit.rateLimiting.enabled) {
                const check = await checkRateLimit(user.id, "USER", "RESEND_VERIFICATION", resendLimit.rateLimiting.passwordReset, ctx.companyId);
                if (check.exceeded) {
                    throw new TRPCError({
                        code: "TOO_MANY_REQUESTS",
                        message: `Too many attempts. Please try again after ${check.resetAt.toLocaleTimeString()}.`,
                    });
                }
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
            await enforceRecoveryRateLimit("FORGOT_PASSWORD", input.email)

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

            // Get base URL for reset link
            const headersList = await headers()
            const protocol = headersList.get("x-forwarded-proto") || "http"
            const host = headersList.get("host") || "localhost:3000"
            const baseUrl = `${protocol}://${host}`

            // Same path whether or not the account exists: the token and email work happens after the
            // response, so response time does not reveal which addresses are registered
            await runAfter(async () => {
                if (!user) return

                // Prefer the recovery email if provided
                const emailToUse = user.recoveryEmail || user.email

                const { createPasswordResetToken, sendPasswordResetEmail } = await import("@/lib/password-reset")
                const token = await createPasswordResetToken(user.id, emailToUse)
                await sendPasswordResetEmail(user.id, emailToUse, token, baseUrl)

                await createAuditLog(
                    {
                        action: "PASSWORD_RESET_REQUESTED",
                        resource: "User",
                        resourceId: user.id,
                        userId: user.id,
                    },
                    { sync: true }
                )
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
            await enforceRecoveryRateLimit("RESET_PASSWORD")

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
            await enforceRecoveryRateLimit("VERIFY_SECURITY_QUESTIONS", input.email)

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
                select: { id: true, email: true },
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
            await createAuditLog({
                action: "SECURITY_QUESTIONS_VERIFIED",
                resource: "User",
                resourceId: user.id,
                userId: user.id,
            })

            // Issue a single-use, short-lived reset token that proves the answers
            // were verified server-side. The client carries THIS (not a raw userId)
            // to the reset step, which consumes it — preventing unauthenticated resets.
            const { createPasswordResetToken } = await import("@/lib/password-reset")
            const resetToken = await createPasswordResetToken(user.id, user.email)

            return { success: true, resetToken }
        }),

    // Get security questions for recovery (without authentication)
    getUserSecurityQuestionsForRecovery: baseProcedure
        .input(
            z.object({
                email: z.string().email("Invalid email address"),
            })
        )
        .mutation(async ({ input, ctx }) => {
            await enforceRecoveryRateLimit("SECURITY_QUESTIONS_LOOKUP", input.email)

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
                // Single-use token issued by verifySecurityQuestions (NOT a raw userId).
                resetToken: z.string().min(1),
                newPassword: z.string().min(8, "Password must be at least 8 characters"),
            })
        )
        .mutation(async ({ input }) => {
            await enforceRecoveryRateLimit("RESET_PASSWORD_SECURITY_QUESTIONS")

            // Authorization: the reset is only allowed with a valid, unexpired,
            // single-use token proving the security questions were just answered.
            const { verifyPasswordResetToken, markPasswordResetTokenAsUsed } = await import(
                "@/lib/password-reset"
            )
            const tokenResult = await verifyPasswordResetToken(input.resetToken)
            if (!tokenResult.valid || !tokenResult.userId) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Invalid or expired reset request. Please verify your security questions again.",
                })
            }
            const userId = tokenResult.userId

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
                where: { id: userId },
                data: { password: hashedPassword },
            })

            // Consume the token (single-use) and invalidate all sessions.
            await markPasswordResetTokenAsUsed(input.resetToken)
            await prisma.session.deleteMany({
                where: { userId },
            })

            // Create audit log
            await createAuditLog({
                action: "PASSWORD_RESET_VIA_SECURITY_QUESTIONS",
                resource: "User",
                resourceId: userId,
                userId,
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
            const currentUser = { companyId: ctx.companyId }

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

            await setSignedCookie(PASSKEY_REG_COOKIE, { userId: user.id, challenge }, CHALLENGE_TTL_SECONDS)

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
            const expectedChallenge = await takeChallenge(PASSKEY_REG_COOKIE, ctx.userId!)

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

            // Challenge, user and email travel in a signed httpOnly cookie
            await setSignedCookie(
                PASSKEY_AUTH_COOKIE,
                { userId: user.id, email: input.email, challenge },
                CHALLENGE_TTL_SECONDS
            )

            return { options }
        }),

    // Verify passkey authentication and log in
    verifyPasskeyAuthentication: baseProcedure
        .input(z.object({
            email: z.string().email("Invalid email address"),
            response: z.unknown(),
        }))
        .mutation(async ({ input, ctx }) => {
            const stored = await takeSignedCookie<{ userId: string; email: string; challenge: string }>(PASSKEY_AUTH_COOKIE)
            const storedData = stored && stored.email === input.email ? stored : null

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
            await createAuditLog({
                action: "PASSKEY_DELETED",
                resource: "User",
                resourceId: ctx.userId!,
                details: { name: passkey.name },
                userId: ctx.userId!,
            })

            return { success: true }
        }),
    checkEmailVerification: baseProcedure
        .query(async ({ ctx }) => {
            // Logged-out visitors (or a user that no longer exists) simply are not verified
            return {
                emailVerified: ctx.user?.emailVerified ?? null,
            };
        }),
});
