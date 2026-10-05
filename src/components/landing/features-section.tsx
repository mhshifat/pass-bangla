"use client"

import { useRef } from "react"
import {
  Lock,
  Shield,
  Users,
  History,
  Search,
  FolderTree,
  Share2,
  RotateCcw,
  AlertTriangle,
  Key,
  FileText,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useTranslation } from "@/hooks/use-translation"
import { useReveal } from "./use-reveal"

export function FeaturesSection() {
  const { t } = useTranslation()
  const sectionRef = useRef<HTMLDivElement>(null)
  useReveal(sectionRef, ".feature-card", 80)

  const features = [
    {
      icon: Lock,
      title: t("landing.features.secureStorage.title"),
      description: t("landing.features.secureStorage.description"),
      color: "text-blue-600",
    },
    {
      icon: Shield,
      title: t("landing.features.breachDetection.title"),
      description: t("landing.features.breachDetection.description"),
      color: "text-red-600",
    },
    {
      icon: Users,
      title: t("landing.features.teamCollaboration.title"),
      description: t("landing.features.teamCollaboration.description"),
      color: "text-purple-600",
    },
    {
      icon: History,
      title: t("landing.features.passwordHistory.title"),
      description: t("landing.features.passwordHistory.description"),
      color: "text-green-600",
    },
    {
      icon: Search,
      title: t("landing.features.advancedSearch.title"),
      description: t("landing.features.advancedSearch.description"),
      color: "text-orange-600",
    },
    {
      icon: FolderTree,
      title: t("landing.features.organizeTag.title"),
      description: t("landing.features.organizeTag.description"),
      color: "text-indigo-600",
    },
    {
      icon: Share2,
      title: t("landing.features.secureSharing.title"),
      description: t("landing.features.secureSharing.description"),
      color: "text-pink-600",
    },
    {
      icon: RotateCcw,
      title: t("landing.features.autoRotation.title"),
      description: t("landing.features.autoRotation.description"),
      color: "text-cyan-600",
    },
    {
      icon: AlertTriangle,
      title: t("landing.features.securityAlerts.title"),
      description: t("landing.features.securityAlerts.description"),
      color: "text-yellow-600",
    },
    {
      icon: Key,
      title: t("landing.features.totp2fa.title"),
      description: t("landing.features.totp2fa.description"),
      color: "text-teal-600",
    },
    {
      icon: FileText,
      title: t("landing.features.passwordTemplates.title"),
      description: t("landing.features.passwordTemplates.description"),
      color: "text-amber-600",
    },
    {
      icon: Zap,
      title: t("landing.features.fastReliable.title"),
      description: t("landing.features.fastReliable.description"),
      color: "text-violet-600",
    },
  ]

  return (
    <section
      ref={sectionRef}
      id="features"
      className="py-24 px-4 bg-muted/30"
    >
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            {t("landing.features.title")}{" "}
            <span className="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              {t("landing.features.titleHighlight")}
            </span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t("landing.features.subtitle")}
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <div
                key={index}
                data-reveal-from="pop"
                className="feature-card group relative p-6 rounded-xl bg-card border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
              >
                {/* Icon */}
                <div className={cn("mb-4 p-3 rounded-lg bg-muted w-fit", feature.color)}>
                  <Icon className="h-6 w-6" />
                </div>

                {/* Content */}
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {feature.description}
                </p>

                {/* Hover effect */}
                <div className="absolute inset-0 rounded-xl bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10" />
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

