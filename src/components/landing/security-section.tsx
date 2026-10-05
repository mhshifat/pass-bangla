"use client"

import { useRef } from "react"
import { Shield, Lock, Key, Eye, Server, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTranslation } from "@/hooks/use-translation"
import { useReveal } from "./use-reveal"

export function SecuritySection() {
  const { t } = useTranslation()
  const sectionRef = useRef<HTMLDivElement>(null)
  useReveal(sectionRef, ".security-card, [data-shield]", 150)

  const securityFeatures = [
    {
      icon: Lock,
      title: t("landing.security.aes256cbc.title"),
      description: t("landing.security.aes256cbc.description"),
    },
    {
      icon: Key,
      title: t("landing.security.clientSideEncryption.title"),
      description: t("landing.security.clientSideEncryption.description"),
    },
    {
      icon: Shield,
      title: t("landing.security.pbkdf2.title"),
      description: t("landing.security.pbkdf2.description"),
    },
    {
      icon: Eye,
      title: t("landing.security.zeroKnowledge.title"),
      description: t("landing.security.zeroKnowledge.description"),
    },
    {
      icon: Server,
      title: t("landing.security.encryptedAtRest.title"),
      description: t("landing.security.encryptedAtRest.description"),
    },
    {
      icon: CheckCircle2,
      title: t("landing.security.httpsEverywhere.title"),
      description: t("landing.security.httpsEverywhere.description"),
    },
  ]

  return (
    <section
      ref={sectionRef}
      id="security"
      className="py-24 px-4 bg-background relative overflow-hidden"
    >
      {/* Background decoration */}
      <div className="absolute inset-0 bg-linear-to-br from-blue-50/30 via-purple-50/20 to-pink-50/30 dark:from-background dark:via-background dark:to-muted/10" />
      <div className="absolute top-0 left-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            {t("landing.security.title")}{" "}
            <span className="bg-linear-to-r from-primary to-blue-600 bg-clip-text text-transparent">
              {t("landing.security.titleHighlight")}
            </span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t("landing.security.subtitle")}
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-12 items-center">
          {/* Left Column - Security Features */}
          <div className="space-y-6">
            {securityFeatures.slice(0, 3).map((feature, index) => {
              const Icon = feature.icon
              return (
                <div
                  key={index}
                  data-reveal-from="left"
                  className={cn(
                    "security-card flex gap-4 p-5 rounded-xl bg-card border border-border hover:border-primary/50 transition-all h-[140px]",
                    index === 0 ? "ml-0" : index === 1 ? "-ml-4" : "-ml-8"
                  )}
                >
                  <div className="p-3 rounded-lg bg-primary/10 text-primary shrink-0 h-fit">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 flex flex-col justify-center min-w-0">
                    <h3 className="font-semibold mb-2 text-base leading-tight line-clamp-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                      {feature.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Center - Shield Icon */}
          <div className="flex justify-center">
            <div
              data-shield
              data-reveal-from="spin"
              data-reveal-keep
              className="relative p-8 rounded-full bg-linear-to-br from-primary/20 to-purple-600/20 border-2 border-primary/30"
            >
              <Shield className="h-24 w-24 md:h-32 md:w-32 text-primary" />
              <div className="absolute inset-0 bg-primary/10 rounded-full blur-2xl -z-10" />
            </div>
          </div>

          {/* Right Column - Security Features */}
          <div className="space-y-6">
            {securityFeatures.slice(3, 6).map((feature, index) => {
              const Icon = feature.icon
              return (
                <div
                  key={index}
                  data-reveal-from="right"
                  className={cn(
                    "security-card flex gap-4 p-5 rounded-xl bg-card border border-border hover:border-primary/50 transition-all h-[140px]",
                    index === 0 ? "-mr-8" : index === 1 ? "-mr-4" : "mr-0"
                  )}
                >
                  <div className="p-3 rounded-lg bg-primary/10 text-primary shrink-0 h-fit">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 flex flex-col justify-center min-w-0">
                    <h3 className="font-semibold mb-2 text-base leading-tight line-clamp-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                      {feature.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Security Badge */}
        <div className="mt-16 text-center">
          <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-muted border border-border">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="text-sm font-medium">
              {t("landing.security.badge")}
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

