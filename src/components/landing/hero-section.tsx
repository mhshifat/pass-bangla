"use client"

import { useRef } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { ArrowRight, Shield, Lock, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/shared/logo"
import { useTranslation } from "@/hooks/use-translation"
import { useDecorativeWebGL } from "./use-decorative-webgl"

// three.js is ~180 KB gzipped; fetch it after first paint, and only on devices that can afford it
const ThreeBackground = dynamic(() => import("./three-background").then((m) => m.ThreeBackground), {
  ssr: false,
})

const PARTICLES = [0, 1, 2, 3, 4, 5]

export function HeroSection() {
  const { t } = useTranslation()
  const heroRef = useRef<HTMLDivElement>(null)
  const showWebGL = useDecorativeWebGL(heroRef)

  return (
    <section
      ref={heroRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden px-4 pt-32 pb-20"
    >
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-linear-to-br from-blue-50/50 via-purple-50/30 to-pink-50/50 dark:from-background dark:via-background dark:to-muted/20" />

      {/* Three.js Background */}
      {showWebGL && <ThreeBackground />}

      {/* Animated grid pattern */}
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none">
        {PARTICLES.map((i) => (
          <div
            key={i}
            className="pb-float absolute w-2 h-2 rounded-full bg-primary/20"
            style={{
              left: `${20 + i * 15}%`,
              top: `${30 + (i % 3) * 20}%`,
              ["--float-y" as string]: i % 2 === 0 ? "-20px" : "20px",
              ["--float-x" as string]: i % 2 === 0 ? "10px" : "-10px",
              ["--float-r" as string]: i % 2 === 0 ? "5deg" : "-5deg",
              ["--float-duration" as string]: `${3.5 + (i % 3) * 0.5}s`,
              ["--float-delay" as string]: `${i * 200}ms`,
            }}
          />
        ))}
      </div>

      {/* Decorative orbs */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-blue-200/30 dark:bg-primary/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 animate-pulse" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-200/30 dark:bg-primary/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2 animate-pulse" style={{ animationDelay: "1s" }} />

      {/* Content */}
      <div className="relative z-10 max-w-6xl mx-auto text-center space-y-8">
        {/* Beta Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm font-medium text-primary mb-4">
          <Sparkles className="h-4 w-4" />
          <span>{t("landing.hero.betaBadge")}</span>
        </div>

        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="pb-hero-logo relative">
            <Logo className="h-20 w-20 md:h-24 md:w-24" />
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl -z-10" />
          </div>
        </div>

        {/* Title */}
        <h1 className="pb-hero-rise text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight">
          <span className="bg-linear-to-r from-primary via-purple-600 to-pink-600 bg-clip-text text-transparent">
            {t("landing.hero.title1")}
          </span>
          <br />
          <span className="text-foreground">{t("landing.hero.title2")}</span>
        </h1>

        {/* Subtitle */}
        <p
          className="pb-hero-rise text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto"
          style={{ ["--rise-delay" as string]: "80ms" }}
        >
          {t("landing.hero.subtitle")}
        </p>

        {/* Security badges */}
        <div
          className="pb-hero-rise flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground"
          style={{ ["--rise-delay" as string]: "140ms" }}
        >
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span>{t("landing.hero.aes256")}</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            <span>{t("landing.hero.clientSide")}</span>
          </div>
        </div>

        {/* CTA Buttons */}
        <div
          className="pb-hero-rise flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"
          style={{ ["--rise-delay" as string]: "200ms" }}
        >
          <Button asChild size="lg" className="text-lg px-8">
            <Link href="/register">
              {t("landing.hero.getStarted")}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="text-lg px-8">
            <Link href="/login">
              {t("landing.hero.signIn")}
            </Link>
          </Button>
        </div>

        {/* Trust indicators */}
        <p
          className="pb-hero-rise text-sm text-muted-foreground pt-4"
          style={{ ["--rise-delay" as string]: "260ms" }}
        >
          {t("landing.hero.trustIndicators")}
        </p>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <div className="w-6 h-10 border-2 border-muted-foreground/30 rounded-full flex items-start justify-center p-2">
          <div className="w-1 h-3 bg-muted-foreground/30 rounded-full" />
        </div>
      </div>
    </section>
  )
}
