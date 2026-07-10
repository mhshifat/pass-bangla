"use client"

import Link from "next/link"
import { Logo } from "@/components/shared/logo"
import { Github, Twitter, Mail } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTranslation } from "@/hooks/use-translation"

export function Footer() {
  const { t } = useTranslation()
  
  const footerLinks = {
    product: [
      { name: t("landing.footer.links.features"), href: "#features", comingSoon: false },
      { name: t("landing.footer.links.security"), href: "/security", comingSoon: false },
      { name: t("landing.footer.links.guide"), href: "/guide", comingSoon: false },
      // Pricing/billing hidden for now
      // { name: t("landing.footer.links.pricing"), href: "#pricing", comingSoon: true },
      { name: t("landing.footer.links.changelog"), href: "/changelog", comingSoon: false },
    ],
    company: [
      { name: t("landing.footer.links.about"), href: "#about", comingSoon: true },
      { name: t("landing.footer.links.blogs"), href: "/blogs", comingSoon: false },
      { name: t("landing.footer.links.careers"), href: "#careers", comingSoon: true },
      { name: t("landing.footer.links.contact"), href: "#contact", comingSoon: true },
    ],
    legal: [
      { name: t("landing.footer.links.privacy"), href: "/privacy", comingSoon: false },
      { name: t("landing.footer.links.terms"), href: "/terms", comingSoon: false },
      { name: t("landing.footer.links.security"), href: "/security", comingSoon: false },
      { name: t("landing.footer.links.compliance"), href: "/compliance", comingSoon: false },
    ],
  }

  return (
    <footer className="border-t bg-muted/30 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Logo className="h-8 w-8" />
              <span className="text-xl font-bold">PassBangla</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("landing.footer.tagline")}
            </p>
            <div className="flex gap-4">
              <a
                href="#"
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Twitter"
              >
                <Twitter className="h-5 w-5" />
              </a>
              <a
                href="#"
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="GitHub"
              >
                <Github className="h-5 w-5" />
              </a>
              <a
                href="#"
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Email"
              >
                <Mail className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Product Links */}
          <div>
            <h3 className="font-semibold mb-4">{t("landing.footer.product")}</h3>
            <ul className="space-y-2">
              {footerLinks.product.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className={cn(
                      "text-sm text-muted-foreground hover:text-foreground transition-colors",
                      link.comingSoon && "cursor-not-allowed opacity-60"
                    )}
                    onClick={(e) => link.comingSoon && e.preventDefault()}
                  >
                    {link.name}
                    {link.comingSoon && (
                      <span className="ml-1 text-xs">{t("landing.footer.links.comingSoon")}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h3 className="font-semibold mb-4">{t("landing.footer.company")}</h3>
            <ul className="space-y-2">
              {footerLinks.company.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className={cn(
                      "text-sm text-muted-foreground hover:text-foreground transition-colors",
                      link.comingSoon && "cursor-not-allowed opacity-60"
                    )}
                    onClick={(e) => link.comingSoon && e.preventDefault()}
                  >
                    {link.name}
                    {link.comingSoon && (
                      <span className="ml-1 text-xs">{t("landing.footer.links.comingSoon")}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h3 className="font-semibold mb-4">{t("landing.footer.legal")}</h3>
            <ul className="space-y-2">
              {footerLinks.legal.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className={cn(
                      "text-sm text-muted-foreground hover:text-foreground transition-colors",
                      link.comingSoon && "cursor-not-allowed opacity-60"
                    )}
                    onClick={(e) => link.comingSoon && e.preventDefault()}
                  >
                    {link.name}
                    {link.comingSoon && (
                      <span className="ml-1 text-xs">{t("landing.footer.links.comingSoon")}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {t("landing.footer.copyright", { year: new Date().getFullYear() })}
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{t("landing.footer.madeWith")}</span>
            <span className="text-red-500">♥</span>
            <span>{t("landing.footer.forTeams")}</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

