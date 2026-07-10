"use client"

import { useEffect, useRef } from "react"
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import Link from "next/link"
import { ArrowRight, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTranslation } from "@/hooks/use-translation"

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger)
}

export function CTASection() {
  const { t } = useTranslation()
  const sectionRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Animate content
      const contentItems = contentRef.current ? Array.from(contentRef.current.children) : []
      gsap.from(contentItems, {
        y: 50,
        opacity: 0,
        duration: 1,
        stagger: 0.2,
        ease: "power3.out",
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 80%",
          toggleActions: "play none none none",
        },
      })

      // Continuous pulse for CTA button
      const ctaButton = sectionRef.current?.querySelector("[data-cta-button]")
      if (ctaButton) {
        gsap.to(ctaButton, {
          scale: 1.02,
          duration: 2,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        })
      }
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={sectionRef}
      className="py-24 px-4 relative overflow-hidden"
    >
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-purple-600/10 to-pink-600/10" />
      <div className="absolute top-0 left-0 w-96 h-96 bg-primary/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

      <div className="max-w-4xl mx-auto relative z-10">
        <div ref={contentRef} className="text-center space-y-8">
          {/* Beta Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm font-medium text-primary">
            <Sparkles className="h-4 w-4" />
            <span>{t("landing.cta.badge")}</span>
          </div>

          {/* Heading */}
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold">
            {t("landing.cta.title")}{" "}
            <span className="bg-gradient-to-r from-primary via-purple-600 to-pink-600 bg-clip-text text-transparent">
              {t("landing.cta.titleHighlight")}
            </span>
          </h2>

          {/* Description */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            {t("landing.cta.subtitle")}
          </p>

          {/* Subscription Note — pricing/billing hidden for now */}
          {/*
          <p className="text-sm text-muted-foreground">
            {t("landing.cta.subscriptionNote")}
          </p>
          */}

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button
              data-cta-button
              asChild
              size="lg"
              className="text-lg px-8"
            >
              <Link href="/register">
                {t("landing.cta.startFreeTrial")}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="text-lg px-8"
            >
              <Link href="/login">
                {t("landing.cta.signIn")}
              </Link>
            </Button>
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground pt-8">
            <span>{t("landing.cta.trustIndicators.noCard")}</span>
            <span>{t("landing.cta.trustIndicators.freeBeta")}</span>
            <span>{t("landing.cta.trustIndicators.cancelAnytime")}</span>
          </div>
        </div>
      </div>
    </section>
  )
}

