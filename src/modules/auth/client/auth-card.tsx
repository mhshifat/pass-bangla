"use client"

import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { FadeIn } from "@/components/motion"

interface AuthCardProps {
  title?: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string;
}

export function AuthCard({ title, description, children, footer, className }: AuthCardProps) {
  return (
    <div className={cn("min-h-screen flex items-center justify-center px-4 relative overflow-hidden flex-1", className)}>
      {/* Modern gradient background - more defined for light theme */}
      <div className="absolute inset-0 bg-linear-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-background dark:via-background dark:to-muted/20" />
      
      {/* Animated background pattern */}
      <div className="absolute inset-0 opacity-[0.04] dark:opacity-[0.05]">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: '24px 24px',
        }} />
      </div>

      {/* Decorative gradient orbs - more visible in light theme */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-blue-200/40 dark:bg-primary/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-200/40 dark:bg-primary/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

      {/* Card with backdrop blur */}
      <FadeIn y={12} className="w-full max-w-md relative z-10">
        <Card className="backdrop-blur-sm bg-card/95 border-border/50 shadow-xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">{title}</CardTitle>
            <CardDescription className="text-center">
              {description}
            </CardDescription>
          </CardHeader>
          {children}
          {footer && <CardFooter className="flex flex-col space-y-4 mt-4">{footer}</CardFooter>}
        </Card>
      </FadeIn>
    </div>
  )
}
