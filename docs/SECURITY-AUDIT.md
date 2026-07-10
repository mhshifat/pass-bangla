# Security Audit — PassBangla

Whole-app security audit of the web app (Next.js + tRPC + Prisma) and the browser
extension, with fixes applied. Findings are ordered by severity; each says whether
it is **Fixed (in code)** or **Owner action** (requires your infrastructure).

> ⚠️ The code fixes below are **type-checked but not runtime-tested** (no database /
> staging was available during the audit). Validate on staging before production —
> especially the encryption changes.

## Severity summary

| ID | Severity | Issue | Status |
|----|----------|-------|--------|
| C1 | Critical | At-rest key derived from the **public `userId`** — a DB dump alone decrypts every vault entry | **Fixed** (v2 scheme) + backfill |
| C2 | Critical | `resetPasswordViaSecurityQuestions` reset any account from a client-supplied `userId` (no proof) | **Fixed** (single-use token) |
| H1 | High | **MFA not enforced server-side** — the `/mfa-verify` redirect was client-side only | **Fixed** (tRPC enforcement) |
| H2 | High | Unauthenticated AES-CBC (malleable / padding-oracle) | **Fixed for new data** (v2 = AES-256-GCM) |
| H3 | High | Live secrets present in `web/.env` | **Owner** (rotate); `.env` git-ignored, `.env.example` added |
| H4 | High | 18 high-severity dependency vulns | **18 → 4** via `npm audit fix`; rest need breaking upgrades |
| H5 | High | MFA codes brute-forceable (6-digit, unlimited guesses) | **Fixed** (5-attempt cap + constant-time compare) |
| M1 | Medium | Password generator used `Math.random()` | **Fixed** (Web Crypto CSPRNG + Fisher–Yates) |
| M3 | Medium | bcrypt cost 10 | **Fixed** (→ 12) |

## Fixed in code

- **C1 / H2 — at-rest encryption.** New storage ciphertext is versioned `v2:iv:tag:ct`
  using **AES-256-GCM** with a key derived from the server master secret
  (`PASSWORD_ENCRYPTION_KEY`) **+ owner id**. `decryptFromStorage` is version-aware
  and still reads legacy `iv:ct` data, so nothing becomes unreadable. Storage vs
  the server→client "transport" re-encryption were split so the browser can still
  decrypt (transport stays on the legacy userId scheme). Files:
  `src/lib/server-crypto-migration.ts`, `src/modules/passwords/server/{procedures,rotation-procedures}.ts`.
- **C2 — reset via security questions.** `verifySecurityQuestions` now issues a
  single-use, expiring, user-bound reset token; the reset **consumes** it. No raw
  `userId` is trusted. Files: `src/modules/auth/server/procedures.ts`, recover/reset pages.
- **H1 — MFA enforcement.** `mfaVerified` / `mfaRequired` are propagated into the
  tRPC context and `requirePermission` rejects when `mfaRequired && !mfaVerified`.
  File: `src/trpc/init.ts`.
- **H5 — MFA brute-force.** `verifyMfaCode` caps failed attempts (5) and uses a
  constant-time compare. File: `src/lib/mfa-codes.ts`.
- **M1 / M3.** CSPRNG password generation (`src/components/ui/password-input.tsx`);
  bcrypt cost 12 (`src/lib/auth.ts`).

## Verified GOOD (no action needed)

- `mfaSecret` is stripped before returning to clients (`getCurrentUser`).
- No SSRF — no server-side fetch of user-controlled URLs.
- Forgot-password does not leak account existence.
- Temporary-share tokens are 256-bit CSPRNG; access enforces expiry/max-uses.
- Security headers present (CSP, `X-Frame-Options: DENY`, HSTS, nosniff) in
  `src/middleware.ts`. Session cookies: `httpOnly` + `secure`(prod) + `sameSite=lax`,
  JWT-signed. Login has rate-limiting + brute-force lockout.
- No raw SQL. Extension `host_permissions` are scoped; messaging is browser-restricted.

## Owner runbook (do on STAGING first, with a DB backup)

1. **Confirm `PASSWORD_ENCRYPTION_KEY` is set and BACKED UP.** If lost after
   migration, v2 data is unrecoverable.
2. **Smoke-test:** create / view / copy / edit / rotate / import / share / export a
   password, and open a pre-existing one (exercises the legacy fallback). All must
   round-trip.
3. **Backfill legacy → v2:** `npm run backfill-encryption` (dry run) → review the
   counts and any "undecryptable" rows → then `npm run backfill-encryption -- --apply`.
4. **Rotate** the secrets that were in `web/.env` (H3): encryption keys,
   `SESSION_SECRET`, Resend/SMTP, Bytloop, Google OAuth. See `.env.example`.
5. **Dependencies (H4):** the remaining highs are a tRPC prototype-pollution advisory
   (`experimental_nextAppDirCaller`) and a transitive `tmp` issue — both need
   breaking upgrades + a test pass (`npm audit fix --force` would break the build if
   applied blind).

## Known limitations / lower priority

- The "client-side encryption" transport layer is not true E2E (the server sees
  plaintext); it adds no security beyond TLS. Consider removing it or moving to real
  master-password-derived E2E.
- MFA codes are stored in an in-memory `Map` — won't work across multiple/serverless
  instances; move to Redis for production.
- CSP allows `'unsafe-inline' 'unsafe-eval'` in `script-src` (Next.js requirement);
  move toward nonces over time.
- Security-question recovery reveals whether an account exists (inherent to the
  feature).
