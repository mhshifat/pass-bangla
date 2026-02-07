import { NextRequest, NextResponse } from "next/server"

/**
 * Extract subdomain from request hostname
 * Examples:
 * - bevy.passbangla.com -> "bevy"
 * - passbangla.com -> null (main domain)
 * - localhost:3000 -> null (development)
 */
function getSubdomain(req: NextRequest): string | null {
  const hostname = req.headers.get("host") || ""
  const xForwardedHost = req.headers.get("x-forwarded-host") || ""
  
  // Use x-forwarded-host if available (Vercel uses this)
  const host = xForwardedHost || hostname
  
  // Remove port if present (e.g., "subdomain.passbangla.com:3000" -> "subdomain.passbangla.com")
  const hostWithoutPort = host.split(":")[0]
  
  // In development, subdomain might be in the format: subdomain.localhost:3000
  // In production on Vercel, it would be: subdomain.passbangla.com
  // On Vercel preview deployments: subdomain-xxx.vercel.app
  const parts = hostWithoutPort.split(".")
  
  // Check if this is a Vercel preview deployment (contains "vercel.app")
  const isVercelPreview = hostWithoutPort.includes("vercel.app")
  
  // For Vercel preview deployments, we might need to handle differently
  // But for custom domains, we want: subdomain.passbangla.com
  if (isVercelPreview) {
    // For Vercel preview: project-name-xxx.vercel.app
    // We can't easily extract subdomain from this, so return null
    // Subdomains will work once custom domain is configured
    return null
  }
  
  // If we have at least 3 parts (subdomain.domain.tld) or 2 parts in localhost (subdomain.localhost)
  if (parts.length >= 3 || (parts.length === 2 && parts[1].includes("localhost"))) {
    const subdomain = parts[0]
    // Don't treat "www" as a subdomain
    if (subdomain && subdomain !== "www" && subdomain !== "localhost") {
      return subdomain
    }
  }
  
  return null
}

export async function middleware(req: NextRequest) {
  const subdomain = getSubdomain(req)
  const { pathname } = req.nextUrl

  // Store subdomain in headers for server components to access
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-subdomain", subdomain || "")

  // Route protection based on subdomain (Edge-compatible only)
  // Block /register on subdomains
  if (subdomain && pathname.startsWith("/register")) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  // Allow /login on both main domain and subdomains
  // On main domain, users will enter their company name
  // On subdomain, users will login directly to their company

  // Create response with subdomain header
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
  
  // Preserve subdomain header in response
  response.headers.set("x-subdomain", subdomain || "")
  
  // Security headers
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("X-XSS-Protection", "1; mode=block")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  
  // HSTS (HTTP Strict Transport Security) - only in production with HTTPS
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    )
  }
  
  // Content Security Policy
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js requires unsafe-inline and unsafe-eval
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ")
  
  response.headers.set("Content-Security-Policy", csp)
  
  return response
}

export const config = {
  matcher: ["/((?!_next|api|static|favicon.ico).*)"],
}
