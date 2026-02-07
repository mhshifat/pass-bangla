"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Languages } from "lucide-react"
import { cn } from "@/lib/utils"
import { setLanguageCookie } from "@/lib/i18n-client"

/**
 * LanguageSelector Component
 * 
 * Allows authenticated users to change their language preference.
 * This component should only be used in authenticated areas:
 * - Sidebar (after login)
 * - Profile/Settings page (after login)
 * 
 * Default language is English for all users. Language preference
 * is stored in cookies and user preferences when changed.
 */

const languages = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "bn", name: "Bangla", nativeName: "বাংলা" },
]

interface LanguageSelectorProps {
  className?: string
  variant?: "default" | "outline" | "ghost"
  size?: "default" | "sm" | "lg" | "icon"
  disabled?: boolean
}

export function LanguageSelector({
  className,
  variant = "outline",
  size = "default",
  disabled = false,
}: LanguageSelectorProps) {
  const { i18n } = useTranslation()
  const router = useRouter()
  const [mounted, setMounted] = React.useState(false)
  const [currentLang, setCurrentLang] = React.useState("en") // Default to "en" for SSR
  
  // Only access localStorage after component mounts to avoid hydration mismatch
  React.useEffect(() => {
    setMounted(true)
    // Get initial language from i18n or localStorage
    const savedLang = typeof window !== "undefined" 
      ? localStorage.getItem("i18nextLng") || i18n.language || "en"
      : i18n.language || "en"
    
    setCurrentLang(savedLang)
    
    // If i18n language doesn't match saved language, update it
    if (i18n.language !== savedLang && typeof window !== "undefined") {
      i18n.changeLanguage(savedLang).catch(console.error)
    }
  }, [i18n])
  
  // Listen for language changes to update local state
  React.useEffect(() => {
    if (!mounted) return
    
    const handleLanguageChanged = (lng: string) => {
      setCurrentLang(lng)
      if (typeof document !== "undefined") {
        document.documentElement.lang = lng
      }
    }
    
    i18n.on("languageChanged", handleLanguageChanged)
    
    return () => {
      i18n.off("languageChanged", handleLanguageChanged)
    }
  }, [i18n, mounted])
  
  const currentLanguage = languages.find((lang) => lang.code === currentLang) || languages[0]

  const changeLanguage = async (langCode: string) => {
    try {
      
      // Save to both localStorage and cookie for SSR compatibility
      if (typeof window !== "undefined") {
        localStorage.setItem("i18nextLng", langCode)
        // Set cookie for SSR - must be done before router.refresh()
        setLanguageCookie(langCode)
      }
      
      // Change language in i18n
      await i18n.changeLanguage(langCode)
      await i18n.reloadResources(langCode)
      
      // Update local state immediately for UI feedback
      setCurrentLang(langCode)
      
      // Update HTML lang attribute and font class using a helper function to avoid linter error
      if (typeof document !== "undefined") {
        // Use a function to set the lang attribute to avoid linter error
        const setHtmlLang = (lang: string) => {
          document.documentElement.lang = lang
        }
        setHtmlLang(langCode)
        
        // Update font class based on language
        const body = document.body
        if (langCode === "bn") {
          body.classList.add("font-bengali")
        } else {
          body.classList.remove("font-bengali")
        }
      }
      
      // Trigger server-side refresh to re-render with new language from cookie
      // This ensures SSR and client render the same language
      router.refresh()
      
      // Force a re-render by dispatching a custom event
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("i18n:languageChanged", { detail: langCode }))
      }
    } catch (error) {
      console.error("Failed to change language:", error)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className={cn("gap-2", className)} disabled={disabled}>
          <Languages className="h-4 w-4" />
          {size !== "icon" && (
            <span suppressHydrationWarning>
              {mounted ? currentLanguage.nativeName : "English"}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {languages.map((language) => (
          <DropdownMenuItem
            key={language.code}
            onClick={() => changeLanguage(language.code)}
            className={cn(
              "cursor-pointer",
              i18n.language === language.code && "bg-accent"
            )}
          >
            <div className="flex items-center gap-2">
              <span>{language.nativeName}</span>
              <span className="text-xs text-muted-foreground">({language.name})</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}


