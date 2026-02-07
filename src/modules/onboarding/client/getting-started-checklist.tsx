"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { trpc } from "@/trpc/client"
import { CheckCircle2, Sparkles, X, ChevronDown, ChevronUp, Eye } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { showErrorFromException } from "@/lib/error-toast"

interface ChecklistItem {
  id: string
  labelKey: string
  descriptionKey: string
  route?: string
  action?: () => void
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    id: "create_password",
    labelKey: "onboarding.checklist.createPassword",
    descriptionKey: "onboarding.checklist.createPasswordDesc",
    route: "/admin/passwords",
  },
  {
    id: "setup_mfa",
    labelKey: "onboarding.checklist.setupMfa",
    descriptionKey: "onboarding.checklist.setupMfaDesc",
    route: "/admin/settings/security",
  },
  {
    id: "create_team",
    labelKey: "onboarding.checklist.createTeam",
    descriptionKey: "onboarding.checklist.createTeamDesc",
    route: "/admin/teams",
  },
  {
    id: "explore_dashboard",
    labelKey: "onboarding.checklist.exploreDashboard",
    descriptionKey: "onboarding.checklist.exploreDashboardDesc",
    route: "/admin",
  },
  {
    id: "organize_tags",
    labelKey: "onboarding.checklist.organizeTags",
    descriptionKey: "onboarding.checklist.organizeTagsDesc",
    route: "/admin/passwords/tags",
  },
  {
    id: "use_templates",
    labelKey: "onboarding.checklist.useTemplates",
    descriptionKey: "onboarding.checklist.useTemplatesDesc",
    route: "/admin/passwords/templates",
  },
  {
    id: "check_breaches",
    labelKey: "onboarding.checklist.checkBreaches",
    descriptionKey: "onboarding.checklist.checkBreachesDesc",
    route: "/admin/passwords/breaches",
  },
  {
    id: "setup_rotation",
    labelKey: "onboarding.checklist.setupRotation",
    descriptionKey: "onboarding.checklist.setupRotationDesc",
    route: "/admin/passwords/rotation",
  },
]

export function GettingStartedChecklist() {
  const { t } = useTranslation()
  const router = useRouter()
  const [isDismissed, setIsDismissed] = React.useState(false)
  const [isExpanded, setIsExpanded] = React.useState(false)
  const [isHidden, setIsHidden] = React.useState(false)

  const { data: onboardingStatus, refetch } = trpc.users.getOnboardingStatus.useQuery()
  const completeStepMutation = trpc.users.completeOnboardingStep.useMutation()
  const updateOnboardingMutation = trpc.users.updateOnboardingStatus.useMutation()

  // Filter to only checklist steps (exclude tour and tooltip steps)
  const checklistStepIds = CHECKLIST_ITEMS.map(item => item.id)
  const allCompletedSteps = onboardingStatus?.completedSteps || []
  const completedSteps = allCompletedSteps.filter(stepId => checklistStepIds.includes(stepId))
  const progress = (completedSteps.length / CHECKLIST_ITEMS.length) * 100
  const allCompleted = progress === 100

  // Check if checklist was hidden in preferences
  React.useEffect(() => {
    if (onboardingStatus && allCompleted) {
      // If all completed, check if user previously hid it
      // For now, we'll use local state only
      setIsHidden(false) // Reset on mount, will be set by auto-hide effect
    }
  }, [onboardingStatus, allCompleted])

  // Auto-hide when all completed
  React.useEffect(() => {
    if (allCompleted && !isHidden) {
      const timer = setTimeout(() => {
        setIsHidden(true)
        updateOnboardingMutation.mutate({
          // Store hidden state in preferences
        })
      }, 2000) // Wait 2 seconds after completion
      return () => clearTimeout(timer)
    }
  }, [allCompleted, isHidden, updateOnboardingMutation])

  const handleToggle = async (itemId: string, checked: boolean) => {
    try {
      if (checked) {
        await completeStepMutation.mutateAsync({ step: itemId })
        toast.success(t("onboarding.checklist.itemCompleted"))
        refetch()
      }
    } catch (error) { showErrorFromException(error, error instanceof Error ? error.message : t("onboarding.error")) }
  }

  const handleAction = (item: ChecklistItem) => {
    if (item.route) {
      router.push(item.route)
    } else if (item.action) {
      item.action()
    }
  }

  const handleDismiss = () => {
    setIsDismissed(true)
  }

  const handleRestore = async () => {
    setIsHidden(false)
    setIsExpanded(true)
    try {
      // Remove hidden flag from preferences
      await updateOnboardingMutation.mutateAsync({})
      refetch()
    } catch {
      // Ignore errors
    }
  }

  // Show restore button if hidden
  if (isHidden) {
    return (
      <Card className="mb-6 border-primary/20 bg-primary/5 py-0">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{t("onboarding.checklist.allCompleted")}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRestore}
              className="gap-2"
            >
              <Eye className="h-4 w-4" />
              {t("onboarding.checklist.restore")}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (isDismissed) {
    return null
  }

  return (
    <Card className="mb-6 border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">{t("onboarding.checklist.title")}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-8 w-8"
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDismiss}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3">
          <CardDescription className="mb-0">{t("onboarding.checklist.description")}</CardDescription>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("onboarding.checklist.progress")}</span>
            <span className="font-medium">{completedSteps.length} / {CHECKLIST_ITEMS.length}</span>
          </div>
        </div>
        <div className="mt-3">
          <Progress value={progress} className="h-2" />
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-3 pt-0">
          {CHECKLIST_ITEMS.map((item) => {
            const isCompleted = completedSteps.includes(item.id)
            return (
              <div
                key={item.id}
                className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  checked={isCompleted}
                  onCheckedChange={(checked) => handleToggle(item.id, checked as boolean)}
                  className="mt-1"
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor={item.id}
                      className={`text-sm font-medium cursor-pointer ${isCompleted ? "line-through text-muted-foreground" : ""}`}
                    >
                      {t(item.labelKey)}
                    </label>
                    {isCompleted && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{t(item.descriptionKey)}</p>
                </div>
                {item.route && !isCompleted && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAction(item)}
                  >
                    {t("onboarding.checklist.goTo")}
                  </Button>
                )}
              </div>
            )
          })}
        </CardContent>
      )}
    </Card>
  )
}

