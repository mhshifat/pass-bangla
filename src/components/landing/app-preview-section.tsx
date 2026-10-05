"use client"

import { useRef, useState } from "react"
import dynamic from "next/dynamic"
import { Monitor, Lock, Shield, Users, ArrowRight, ChevronLeft, ChevronRight, Key } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { useTranslation } from "@/hooks/use-translation"
import { useReveal } from "./use-reveal"
import { useDecorativeWebGL } from "./use-decorative-webgl"

// Decorative 3D card: fetched after first paint, only near the viewport and on capable devices
const AppPreviewCanvas = dynamic(() => import("./app-preview-canvas").then((m) => m.AppPreviewCanvas), {
  ssr: false,
})

// Preview screens will be defined in the component to use translations

// Dashboard Preview
function DashboardPreview() {
  return (
    <div className="w-full h-full bg-card border border-border rounded-lg overflow-hidden shadow-2xl min-h-[400px]">
      <div className="h-10 bg-muted border-b border-border flex items-center gap-2 px-4">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <div className="flex-1 bg-background rounded px-3 py-1 text-xs text-muted-foreground mx-4">
          app.passbangla.com
        </div>
      </div>
      <div className="p-6 space-y-6 bg-background">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold">Dashboard</h3>
            <p className="text-sm text-muted-foreground">Overview of your password management</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: Users, label: "Total Users", value: "1,234", color: "text-blue-500" },
            { icon: Lock, label: "Passwords", value: "5,678", color: "text-green-500" },
            { icon: Shield, label: "Teams", value: "89", color: "text-purple-500" },
            { icon: Shield, label: "Security", value: "100%", color: "text-orange-500" },
          ].map((stat, i) => (
            <div key={i} className="p-4 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center justify-between mb-2">
                <stat.icon className={cn("h-5 w-5", stat.color)} />
              </div>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Recent Activity</h4>
          {["Password created", "User added to team", "Security alert resolved"].map((activity, i) => (
            <div key={i} className="p-3 rounded-lg bg-muted/30 border border-border text-sm">
              {activity}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Password Management Preview
function PasswordManagementPreview() {
  return (
    <div className="w-full h-full bg-card border border-border rounded-lg overflow-hidden shadow-2xl min-h-[400px]">
      <div className="h-10 bg-muted border-b border-border flex items-center gap-2 px-4">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <div className="flex-1 bg-background rounded px-3 py-1 text-xs text-muted-foreground mx-4">
          app.passbangla.com/passwords
        </div>
      </div>
      <div className="p-6 space-y-4 bg-background">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold">Passwords</h3>
          <Button size="sm">Add Password</Button>
        </div>
        <div className="space-y-2">
          {[
            { name: "GitHub", username: "user@example.com", strength: "Strong" },
            { name: "AWS Console", username: "admin", strength: "Very Strong" },
            { name: "Email Account", username: "user@email.com", strength: "Strong" },
          ].map((pwd, i) => (
            <div key={i} className="p-4 rounded-lg bg-muted/50 border border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-primary/10">
                  <Key className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="font-semibold">{pwd.name}</div>
                  <div className="text-sm text-muted-foreground">{pwd.username}</div>
                </div>
              </div>
              <div className="px-2 py-1 rounded text-xs bg-green-500/10 text-green-600 dark:text-green-400">
                {pwd.strength}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Team Preview
function TeamPreview() {
  return (
    <div className="w-full h-full bg-card border border-border rounded-lg overflow-hidden shadow-2xl min-h-[400px]">
      <div className="h-10 bg-muted border-b border-border flex items-center gap-2 px-4">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <div className="flex-1 bg-background rounded px-3 py-1 text-xs text-muted-foreground mx-4">
          app.passbangla.com/teams
        </div>
      </div>
      <div className="p-6 space-y-4 bg-background">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold">Teams</h3>
          <Button size="sm">Create Team</Button>
        </div>
        <div className="space-y-3">
          {[
            { name: "Engineering", members: 12, passwords: 45 },
            { name: "Marketing", members: 8, passwords: 23 },
            { name: "Sales", members: 15, passwords: 67 },
          ].map((team, i) => (
            <div key={i} className="p-4 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">{team.name}</div>
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>{team.members} members</span>
                <span>•</span>
                <span>{team.passwords} passwords</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Security Preview
function SecurityPreview() {
  return (
    <div className="w-full h-full bg-card border border-border rounded-lg overflow-hidden shadow-2xl min-h-[400px]">
      <div className="h-10 bg-muted border-b border-border flex items-center gap-2 px-4">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <div className="flex-1 bg-background rounded px-3 py-1 text-xs text-muted-foreground mx-4">
          app.passbangla.com/security
        </div>
      </div>
      <div className="p-6 space-y-4 bg-background">
        <div>
          <h3 className="text-xl font-bold mb-2">Security Settings</h3>
          <p className="text-sm text-muted-foreground">Manage your security preferences</p>
        </div>
        <div className="space-y-3">
          {[
            { label: "Two-Factor Authentication", enabled: true },
            { label: "Master Password", enabled: true },
            { label: "Session Timeout", enabled: false },
            { label: "Audit Logging", enabled: true },
          ].map((setting, i) => (
            <div key={i} className="p-4 rounded-lg bg-muted/50 border border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="h-4 w-4 text-primary" />
                <span className="font-medium">{setting.label}</span>
              </div>
              <div className={cn(
                "px-2 py-1 rounded text-xs",
                setting.enabled 
                  ? "bg-green-500/10 text-green-600 dark:text-green-400" 
                  : "bg-muted text-muted-foreground"
              )}>
                {setting.enabled ? "Enabled" : "Disabled"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function AppPreviewSection() {
  const { t } = useTranslation()
  const sectionRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  useReveal(sectionRef, "[data-reveal-item]", 200)
  const showWebGL = useDecorativeWebGL(canvasRef)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)

  const previewScreens = [
    {
      title: t("landing.preview.dashboard.title"),
      icon: Monitor,
      component: DashboardPreview,
      description: t("landing.preview.dashboard.description"),
    },
    {
      title: t("landing.preview.passwordManagement.title"),
      icon: Lock,
      component: PasswordManagementPreview,
      description: t("landing.preview.passwordManagement.description"),
    },
    {
      title: t("landing.preview.teamCollaboration.title"),
      icon: Users,
      component: TeamPreview,
      description: t("landing.preview.teamCollaboration.description"),
    },
    {
      title: t("landing.preview.securitySettings.title"),
      icon: Shield,
      component: SecurityPreview,
      description: t("landing.preview.securitySettings.description"),
    },
  ]

  // Minimum swipe distance
  const minSwipeDistance = 50

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe && currentIndex < previewScreens.length - 1) {
      setCurrentIndex(currentIndex + 1)
    }
    if (isRightSwipe && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
    }
  }

  const goToSlide = (index: number) => {
    setCurrentIndex(index)
  }

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : previewScreens.length - 1))
  }

  const goToNext = () => {
    setCurrentIndex((prev) => (prev < previewScreens.length - 1 ? prev + 1 : 0))
  }

  // Container is previewScreens.length * 100% wide, so slide N sits at N * (100 / length)%
  const translatePercent = -(currentIndex * (100 / previewScreens.length))

  return (
    <section
      ref={sectionRef}
      id="preview"
      className="py-24 px-4 bg-background relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-purple-500/5 to-pink-500/5" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary mb-4">
            <Monitor className="h-4 w-4" />
            <span>{t("landing.preview.badge")}</span>
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            <span>{t("landing.preview.title")}</span>{" "}
            <span className="bg-gradient-to-r from-primary via-purple-600 to-pink-600 bg-clip-text text-transparent">
              {t("landing.preview.titleHighlight")}
            </span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t("landing.preview.subtitle")}
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Swipeable Preview Carousel */}
          <div
            ref={canvasRef}
            data-reveal-item
            data-reveal-from="zoom"
            className="relative h-[500px]"
          >
            {/* Carousel Container */}
            <div className="relative w-full h-full overflow-hidden rounded-lg z-10">
              <div
                className="flex h-full transition-transform duration-500 ease-in-out"
                style={{
                  width: `${previewScreens.length * 100}%`,
                  transform: `translateX(${translatePercent}%)`,
                }}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
              >
                {previewScreens.map((screen, index) => {
                  const PreviewComponent = screen.component
                  return (
                    <div
                      key={index}
                      className="h-full flex-shrink-0 flex items-center justify-center px-4"
                      style={{ width: `${100 / previewScreens.length}%` }}
                    >
                      <div className="w-full max-w-md h-[400px] transform hover:scale-105 transition-transform duration-300 relative z-10">
                        <PreviewComponent />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Navigation Buttons */}
            <button
              onClick={goToPrevious}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/80 backdrop-blur-sm border border-border hover:bg-background transition-colors z-20"
              aria-label="Previous screen"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={goToNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/80 backdrop-blur-sm border border-border hover:bg-background transition-colors z-20"
              aria-label="Next screen"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            {/* Dots Indicator */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20">
              {previewScreens.map((_, index) => (
                <button
                  key={index}
                  onClick={() => goToSlide(index)}
                  className={cn(
                    "w-2 h-2 rounded-full transition-all",
                    index === currentIndex
                      ? "bg-primary w-8"
                      : "bg-muted-foreground/50 hover:bg-muted-foreground"
                  )}
                  aria-label={`Go to screen ${index + 1}`}
                />
              ))}
            </div>

            {/* 3D Background Elements */}
            {showWebGL && (
              <div className="absolute inset-0 -z-10 opacity-30">
                <AppPreviewCanvas />
              </div>
            )}
          </div>

          {/* Content */}
          <div data-reveal-item data-reveal-from="pop" className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-primary/10 text-primary shrink-0">
                  {(() => {
                    const IconComponent = previewScreens[currentIndex].icon
                    return IconComponent ? <IconComponent className="h-6 w-6" /> : null
                  })()}
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">{previewScreens[currentIndex].title}</h3>
                  <p className="text-muted-foreground">
                    {previewScreens[currentIndex].description}
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/register">
                  {t("landing.preview.tryItFree")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
