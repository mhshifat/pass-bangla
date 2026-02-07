"use client"

import Link from "next/link"
import { Logo } from "@/components/shared/logo"
import { Button } from "@/components/ui/button"
import { useTranslation } from "@/hooks/use-translation"

export function LandingHeader() {
  const { t } = useTranslation()

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Logo className="h-8 w-8" />
            <span className="text-xl font-bold">PassBangla</span>
          </Link>

          {/* Right side - Auth buttons */}
          <div className="flex items-center gap-3">
            {/* Auth Buttons */}
            <div className="hidden sm:flex items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">{t("landing.hero.signIn")}</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">{t("landing.hero.getStarted")}</Link>
              </Button>
            </div>

            {/* Mobile menu button (optional - can add hamburger menu later) */}
            <div className="sm:hidden">
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">{t("landing.hero.signIn")}</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

