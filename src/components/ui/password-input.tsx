"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Eye, EyeOff, Key } from "lucide-react"
import { cn } from "@/lib/utils"

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onGenerate?: () => void
  /** Called with a freshly generated strong password when the generate action fires. */
  onGeneratePassword?: (password: string) => void
  showGenerateButton?: boolean
  showToggleButton?: boolean
  /**
   * The value is a secret being stored (a vault entry, API token, another user's
   * password…), not the signed-in user's own credential for this site. Renders a
   * CSS-masked text input so browser password managers don't offer to save or
   * "update" it as the PassBangla login.
   */
  storedSecret?: boolean
}

// Opt-outs honoured by Chrome/Firefox and the common password manager extensions
const STORED_SECRET_PROPS = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  "data-1p-ignore": true,
  "data-lpignore": "true",
  "data-bwignore": true,
  "data-form-type": "other",
} as const

/**
 * Cryptographically-secure random integer in [0, max) using rejection sampling
 * to avoid modulo bias. Falls back to Math.random only if Web Crypto is
 * unavailable (should never happen in a supported browser).
 */
function secureRandomInt(max: number): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    // Largest multiple of `max` that fits in a uint32 — reject values above it.
    const limit = Math.floor(0x100000000 / max) * max
    const buf = new Uint32Array(1)
    let x = 0
    do {
      crypto.getRandomValues(buf)
      x = buf[0]
    } while (x >= limit)
    return x % max
  }
  return Math.floor(Math.random() * max)
}

/** Cryptographically-secure Fisher–Yates shuffle (in place). */
function secureShuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Generates a strong password with:
 * - At least one lowercase letter
 * - At least one uppercase letter
 * - At least one number
 * - At least one special character
 * - Default length: 16 characters
 *
 * Uses a cryptographically-secure RNG (Web Crypto) with unbiased selection —
 * critical for a password manager.
 */
export function generateStrongPassword(length: number = 16): string {
  const lowercase = "abcdefghijklmnopqrstuvwxyz"
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  const numbers = "0123456789"
  const special = "!@#$%^&*()_+-=[]{}|;:,.<>?"
  const allChars = lowercase + uppercase + numbers + special

  const chars: string[] = []

  // Ensure at least one of each type
  chars.push(lowercase[secureRandomInt(lowercase.length)])
  chars.push(uppercase[secureRandomInt(uppercase.length)])
  chars.push(numbers[secureRandomInt(numbers.length)])
  chars.push(special[secureRandomInt(special.length)])

  // Fill the rest
  for (let i = chars.length; i < length; i++) {
    chars.push(allChars[secureRandomInt(allChars.length)])
  }

  // Unbiased shuffle so the guaranteed-type characters aren't at fixed positions.
  return secureShuffle(chars).join("")
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, onGenerate, onGeneratePassword, showGenerateButton = false, showToggleButton = true, storedSecret = false, type = "password", ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false)

    const handleGenerate = () => {
      if (onGeneratePassword) {
        onGeneratePassword(generateStrongPassword())
      }
      if (onGenerate) {
        onGenerate()
      }
    }

    const togglePasswordVisibility = () => {
      setShowPassword((prev) => !prev)
    }

    const hasButtons = showGenerateButton || showToggleButton
    // A stored secret is never type="password": the browser treats any submitted
    // password field as this site's login. It is masked with CSS instead.
    const inputType = storedSecret || showPassword ? "text" : "password"
    const secretProps = storedSecret ? STORED_SECRET_PROPS : {}
    const maskClass = storedSecret && !showPassword ? "[-webkit-text-security:disc]" : undefined

    if (!hasButtons) {
      return <Input ref={ref} type={inputType} className={cn(maskClass, className)} {...secretProps} {...props} />
    }

    // Calculate padding based on number of buttons
    const buttonCount = (showGenerateButton ? 1 : 0) + (showToggleButton ? 1 : 0)
    const paddingRight = buttonCount === 2 ? "pr-20" : "pr-10"

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={inputType}
          className={cn(paddingRight, maskClass, className)}
          {...secretProps}
          {...props}
        />
        <div className="absolute right-0 top-0 h-full flex items-center">
          {showToggleButton && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-full px-3 py-2 hover:bg-transparent"
              onClick={togglePasswordVisibility}
              disabled={props.disabled}
              title={showPassword ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Eye className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          )}
          {showGenerateButton && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-full px-3 py-2 hover:bg-transparent"
              onClick={handleGenerate}
              disabled={props.disabled}
              title="Generate strong password"
              tabIndex={-1}
            >
              <Key className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
        </div>
      </div>
    )
  }
)
PasswordInput.displayName = "PasswordInput"

