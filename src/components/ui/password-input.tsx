"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Eye, EyeOff, Key } from "lucide-react"
import { cn } from "@/lib/utils"

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onGenerate?: () => void
  showGenerateButton?: boolean
  showToggleButton?: boolean
}

/**
 * Generates a strong password with:
 * - At least one lowercase letter
 * - At least one uppercase letter
 * - At least one number
 * - At least one special character
 * - Default length: 16 characters
 */
export function generateStrongPassword(length: number = 16): string {
  const lowercase = "abcdefghijklmnopqrstuvwxyz"
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  const numbers = "0123456789"
  const special = "!@#$%^&*()_+-=[]{}|;:,.<>?"
  const allChars = lowercase + uppercase + numbers + special

  let password = ""

  // Ensure at least one of each type
  password += lowercase[Math.floor(Math.random() * lowercase.length)]
  password += uppercase[Math.floor(Math.random() * uppercase.length)]
  password += numbers[Math.floor(Math.random() * numbers.length)]
  password += special[Math.floor(Math.random() * special.length)]

  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)]
  }

  // Shuffle the password to avoid predictable pattern
  password = password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("")

  return password
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, onGenerate, showGenerateButton = false, showToggleButton = true, type = "password", ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false)
    
    const handleGenerate = () => {
      if (onGenerate) {
        onGenerate()
      }
    }

    const togglePasswordVisibility = () => {
      setShowPassword((prev) => !prev)
    }

    const hasButtons = showGenerateButton || showToggleButton
    const inputType = showPassword ? "text" : "password"

    if (!hasButtons) {
      return <Input ref={ref} type={inputType} className={className} {...props} />
    }

    // Calculate padding based on number of buttons
    const buttonCount = (showGenerateButton ? 1 : 0) + (showToggleButton ? 1 : 0)
    const paddingRight = buttonCount === 2 ? "pr-20" : "pr-10"

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={inputType}
          className={cn(paddingRight, className)}
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

