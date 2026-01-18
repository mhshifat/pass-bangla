/**
 * WebAuthn (Passkey) Helper Functions
 * 
 * This module provides functions for WebAuthn credential registration and authentication.
 * It uses the @simplewebauthn/server library for server-side operations.
 */

import {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
    type VerifiedRegistrationResponse,
    type VerifiedAuthenticationResponse,
    type PublicKeyCredentialCreationOptionsJSON,
    type PublicKeyCredentialRequestOptionsJSON,
    type RegistrationResponseJSON,
    type AuthenticationResponseJSON,
    type AuthenticatorTransportFuture,
} from "@simplewebauthn/server"

// Get RP (Relying Party) configuration from environment
const RP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "PassBangla"

// Helper function to get the correct RP ID from the request
function getRPID(origin?: string): string {
    if (!origin && typeof window !== "undefined") {
        origin = window.location.origin
    }
    
    if (origin) {
        try {
            const url = new URL(origin)
            const hostname = url.hostname
            
            // For localhost subdomains (e.g., test.localhost, bevy.localhost)
            // We MUST use the full hostname, not just "localhost"
            // WebAuthn requires exact match for .localhost domains
            if (hostname.endsWith(".localhost")) {
                return hostname
            }
            
            // For plain localhost (no subdomain), use "localhost"
            if (hostname === "localhost") {
                return "localhost"
            }
            
            // For production domains with subdomains, use the base domain
            // e.g., app.example.com -> example.com
            const parts = hostname.split(".")
            if (parts.length > 2) {
                return parts.slice(-2).join(".")
            }
            
            return hostname
        } catch {
            return "localhost"
        }
    }
    
    return process.env.NEXT_PUBLIC_DOMAIN || "localhost"
}

function getOrigin(): string {
    if (typeof window !== "undefined") {
        return window.location.origin
    }
    return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
}

export interface WebAuthnCredential {
    credentialID: string
    publicKey: string
    counter: number
    deviceType?: "singleDevice" | "multiDevice"
    backedUp: boolean
    transports?: string[]
}

/**
 * Generate registration options for creating a new passkey
 */
export async function generateWebAuthnRegistrationOptions(
    userId: string,
    userEmail: string,
    userName: string,
    existingCredentials: WebAuthnCredential[] = [],
    origin?: string
): Promise<{
    options: PublicKeyCredentialCreationOptionsJSON
    challenge: string
}> {
    const rpID = getRPID(origin)
    const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: rpID,
        userName: userEmail,
        userDisplayName: userName,
        userID: new TextEncoder().encode(userId),
        // Don't prompt users for additional information about the authenticator
        attestationType: "none",
        // Prevent users from re-registering existing authenticators
        excludeCredentials: existingCredentials.map((cred) => ({
            id: cred.credentialID,
            transports: cred.transports as AuthenticatorTransportFuture[] | undefined,
        })),
        authenticatorSelection: {
            // Don't restrict authenticator type - allow platform (Windows Hello, Touch ID)
            // AND cross-platform (security keys, phones) so user can choose
            // authenticatorAttachment: "platform", // Removed to allow more options
            // Require user verification (biometric, PIN, etc.)
            userVerification: "required",
            // Allow discoverable credentials (passkeys that can be used without username)
            residentKey: "preferred",
        },
    })

    return {
        options,
        challenge: options.challenge,
    }
}

/**
 * Verify registration response from the client
 */
export async function verifyWebAuthnRegistration(
    response: RegistrationResponseJSON,
    expectedChallenge: string,
    origin?: string
): Promise<{
    verified: boolean
    credential?: WebAuthnCredential
    error?: string
}> {
    try {
        const rpID = getRPID(origin)
        const expectedOrigin = origin || getOrigin()
        const verification: VerifiedRegistrationResponse = await verifyRegistrationResponse({
            response,
            expectedChallenge,
            expectedOrigin: expectedOrigin,
            expectedRPID: rpID,
            requireUserVerification: true,
        })

        if (!verification.verified || !verification.registrationInfo) {
            return {
                verified: false,
                error: "Verification failed",
            }
        }

        const regInfo = verification.registrationInfo
        const credential = regInfo.credential

        // credential.id is a Uint8Array, convert to Base64URL string
        // This is the same format the browser will return during authentication
        const credentialIdBase64 = Buffer.from(credential.id).toString("base64url")
        
        return {
            verified: true,
            credential: {
                credentialID: credentialIdBase64,
                publicKey: Buffer.from(credential.publicKey).toString("base64url"),
                counter: credential.counter,
                deviceType: regInfo.credentialDeviceType,
                backedUp: regInfo.credentialBackedUp,
                transports: response.response.transports,
            },
        }
    } catch (error) {
        console.error("WebAuthn registration verification error:", error)
        return {
            verified: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

/**
 * Generate authentication options for logging in with a passkey
 */
export async function generateWebAuthnAuthenticationOptions(
    credentials: WebAuthnCredential[],
    origin?: string
): Promise<{
    options: PublicKeyCredentialRequestOptionsJSON
    challenge: string
}> {
    const rpID = getRPID(origin)
    
    // If we have credentials, use them in allowCredentials
    // Otherwise, use discoverable credentials (empty allowCredentials lets browser find any passkey for this RP)
    const allowCredentials = credentials.length > 0 
        ? credentials.map((cred) => ({
            id: cred.credentialID,
            transports: cred.transports as AuthenticatorTransportFuture[] | undefined,
        }))
        : undefined
    
    const options = await generateAuthenticationOptions({
        rpID: rpID,
        // Allow any of the user's registered credentials, or use discoverable if none specified
        allowCredentials,
        userVerification: "required",
    })

    return {
        options,
        challenge: options.challenge,
    }
}

/**
 * Verify authentication response from the client
 */
export async function verifyWebAuthnAuthentication(
    response: AuthenticationResponseJSON,
    expectedChallenge: string,
    credential: WebAuthnCredential,
    origin?: string
): Promise<{
    verified: boolean
    newCounter?: number
    error?: string
}> {
    try {
        const rpID = getRPID(origin)
        const expectedOrigin = origin || getOrigin()
        const verification: VerifiedAuthenticationResponse = await verifyAuthenticationResponse({
            response,
            expectedChallenge,
            expectedOrigin: expectedOrigin,
            expectedRPID: rpID,
            credential: {
                id: credential.credentialID,
                publicKey: Buffer.from(credential.publicKey, "base64url"),
                counter: credential.counter,
            },
            requireUserVerification: true,
        })

        if (!verification.verified) {
            return {
                verified: false,
                error: "Verification failed",
            }
        }

        return {
            verified: true,
            newCounter: verification.authenticationInfo.newCounter,
        }
    } catch (error) {
        console.error("WebAuthn authentication verification error:", error)
        return {
            verified: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

/**
 * Check if WebAuthn is supported in the current environment
 */
export function isWebAuthnSupported(): boolean {
    return (
        typeof window !== "undefined" &&
        typeof window.PublicKeyCredential !== "undefined"
    )
}

/**
 * Check if the user's device supports platform authenticators (Face ID, Touch ID, Windows Hello)
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
    if (!isWebAuthnSupported()) {
        return false
    }

    try {
        return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    } catch {
        return false
    }
}
