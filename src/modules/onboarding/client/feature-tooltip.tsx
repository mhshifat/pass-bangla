"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { X, Sparkles } from "lucide-react"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { showErrorFromException } from "@/lib/error-toast"

interface FeatureTooltipProps {
  featureId: string
  titleKey: string
  descriptionKey: string
  children: React.ReactNode
  placement?: "top" | "bottom" | "left" | "right"
  onDismiss?: () => void
}

export function FeatureTooltip({
  featureId,
  titleKey,
  descriptionKey,
  children,
  placement = "top",
  onDismiss,
}: FeatureTooltipProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = React.useState(false)
  const [isDismissed, setIsDismissed] = React.useState(false)

  const { data: onboardingStatus } = trpc.users.getOnboardingStatus.useQuery(undefined, {
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
  const completeStepMutation = trpc.users.completeOnboardingStep.useMutation()

  // Check if this feature tooltip should be shown
  const shouldShow = React.useMemo(() => {
    if (isDismissed) return false
    if (onboardingStatus?.hasCompletedOnboarding) return false
    if (onboardingStatus?.skippedOnboarding) return false
    
    // Show tooltip if feature step is not completed
    const completedSteps = onboardingStatus?.completedSteps || []
    return !completedSteps.includes(`tooltip_${featureId}`)
  }, [featureId, onboardingStatus, isDismissed])

  React.useEffect(() => {
    if (shouldShow) {
      // Show tooltip after a short delay
      const timer = setTimeout(() => setIsOpen(true), 500)
      return () => clearTimeout(timer)
    }
  }, [shouldShow])

  const handleDismiss = async () => {
    setIsDismissed(true)
    setIsOpen(false)
    
    try {
      await completeStepMutation.mutateAsync({ step: `tooltip_${featureId}` })
      onDismiss?.()
    } catch (error) { showErrorFromException(error, error instanceof Error ? error.message : t("onboarding.error")) }
  }

  if (!shouldShow || isDismissed) {
    return <>{children}</>
  }

  return (
    <Tooltip open={isOpen} onOpenChange={setIsOpen}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={placement}
        className="max-w-sm p-4 bg-popover text-popover-foreground"
        onPointerDownOutside={(e) => {
          // Prevent closing on click outside for onboarding tooltips
          e.preventDefault()
        }}
      >
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h4 className="font-semibold text-sm">{t(titleKey)}</h4>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleDismiss}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t(descriptionKey)}</p>
          <Button
            size="sm"
            className="w-full"
            onClick={handleDismiss}
          >
            {t("onboarding.tooltip.gotIt")}
          </Button>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

