"use client"

import * as React from "react"
import { TourProvider, useTour } from "@/components/tour"
import { TourAlertDialog } from "@/components/tour"
import { trpc } from "@/trpc/client"
import { TOUR_STEP_IDS } from "@/lib/tour-constants"
import { useTranslation } from "react-i18next"

interface OnboardingProviderProps {
  children: React.ReactNode
}

function OnboardingContent({ children }: { children: React.ReactNode }) {
  const [showAlert, setShowAlert] = React.useState(false)
  const { setSteps } = useTour()
  const { t } = useTranslation()
  const { data: onboardingStatus, isLoading, refetch } = trpc.users.getOnboardingStatus.useQuery(undefined, {
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
  const updateOnboardingMutation = trpc.users.updateOnboardingStatus.useMutation()
  
  // Define comprehensive tour steps covering all features and sub-features
  React.useEffect(() => {
    const steps = [
      // Main Dashboard
      {
        content: (
          <div>
            <h3 className="font-semibold mb-2">{t("onboarding.tour.dashboard.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("onboarding.tour.dashboard.description")}</p>
          </div>
        ),
        selectorId: TOUR_STEP_IDS.DASHBOARD,
        position: "bottom" as const,
      },
      // Passwords - Main
      {
        content: (
          <div>
            <h3 className="font-semibold mb-2">{t("onboarding.tour.passwords.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("onboarding.tour.passwords.description")}</p>
          </div>
        ),
        selectorId: TOUR_STEP_IDS.PASSWORDS,
        position: "right" as const,
      },
      // Search
      {
        content: (
          <div>
            <h3 className="font-semibold mb-2">{t("onboarding.tour.search.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("onboarding.tour.search.description")}</p>
          </div>
        ),
        selectorId: TOUR_STEP_IDS.SEARCH,
        position: "bottom" as const,
      },
      // Favorites
      {
        content: (
          <div>
            <h3 className="font-semibold mb-2">{t("onboarding.tour.favorites.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("onboarding.tour.favorites.description")}</p>
          </div>
        ),
        selectorId: TOUR_STEP_IDS.FAVORITES,
        position: "right" as const,
      },
      // Tags
      {
        content: (
          <div>
            <h3 className="font-semibold mb-2">{t("onboarding.tour.tags.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("onboarding.tour.tags.description")}</p>
          </div>
        ),
        selectorId: TOUR_STEP_IDS.TAGS,
        position: "right" as const,
      },
      // Templates
      {
        content: (
          <div>
            <h3 className="font-semibold mb-2">{t("onboarding.tour.templates.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("onboarding.tour.templates.description")}</p>
          </div>
        ),
        selectorId: TOUR_STEP_IDS.TEMPLATES,
        position: "right" as const,
      },
      // Duplicate Detection
      {
        content: (
          <div>
            <h3 className="font-semibold mb-2">{t("onboarding.tour.duplicateDetection.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("onboarding.tour.duplicateDetection.description")}</p>
          </div>
        ),
        selectorId: TOUR_STEP_IDS.DUPLICATE_DETECTION,
        position: "right" as const,
      },
      // Breach Detection
      {
        content: (
          <div>
            <h3 className="font-semibold mb-2">{t("onboarding.tour.breachDetection.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("onboarding.tour.breachDetection.description")}</p>
          </div>
        ),
        selectorId: TOUR_STEP_IDS.BREACH_DETECTION,
        position: "right" as const,
      },
      // Password Rotation
      {
        content: (
          <div>
            <h3 className="font-semibold mb-2">{t("onboarding.tour.rotation.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("onboarding.tour.rotation.description")}</p>
          </div>
        ),
        selectorId: TOUR_STEP_IDS.ROTATION,
        position: "right" as const,
      },
      // Users
      {
        content: (
          <div>
            <h3 className="font-semibold mb-2">{t("onboarding.tour.users.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("onboarding.tour.users.description")}</p>
          </div>
        ),
        selectorId: TOUR_STEP_IDS.USERS,
        position: "right" as const,
      },
      // Teams
      {
        content: (
          <div>
            <h3 className="font-semibold mb-2">{t("onboarding.tour.teams.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("onboarding.tour.teams.description")}</p>
          </div>
        ),
        selectorId: TOUR_STEP_IDS.TEAMS,
        position: "right" as const,
      },
      // Roles
      {
        content: (
          <div>
            <h3 className="font-semibold mb-2">{t("onboarding.tour.roles.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("onboarding.tour.roles.description")}</p>
          </div>
        ),
        selectorId: TOUR_STEP_IDS.ROLES,
        position: "right" as const,
      },
      // Audit Logs
      {
        content: (
          <div>
            <h3 className="font-semibold mb-2">{t("onboarding.tour.auditLogs.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("onboarding.tour.auditLogs.description")}</p>
          </div>
        ),
        selectorId: TOUR_STEP_IDS.AUDIT_LOGS,
        position: "right" as const,
      },
      // Settings - Main
      {
        content: (
          <div>
            <h3 className="font-semibold mb-2">{t("onboarding.tour.settings.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("onboarding.tour.settings.description")}</p>
          </div>
        ),
        selectorId: TOUR_STEP_IDS.SETTINGS,
        position: "right" as const,
      },
      // Settings - General
      {
        content: (
          <div>
            <h3 className="font-semibold mb-2">{t("onboarding.tour.settingsGeneral.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("onboarding.tour.settingsGeneral.description")}</p>
          </div>
        ),
        selectorId: TOUR_STEP_IDS.SETTINGS_GENERAL,
        position: "right" as const,
      },
      // Settings - Email
      {
        content: (
          <div>
            <h3 className="font-semibold mb-2">{t("onboarding.tour.settingsEmail.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("onboarding.tour.settingsEmail.description")}</p>
          </div>
        ),
        selectorId: TOUR_STEP_IDS.SETTINGS_EMAIL,
        position: "right" as const,
      },
      // Settings - Security
      {
        content: (
          <div>
            <h3 className="font-semibold mb-2">{t("onboarding.tour.settingsSecurity.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("onboarding.tour.settingsSecurity.description")}</p>
          </div>
        ),
        selectorId: TOUR_STEP_IDS.SETTINGS_SECURITY,
        position: "right" as const,
      },
      // Settings - MFA
      {
        content: (
          <div>
            <h3 className="font-semibold mb-2">{t("onboarding.tour.settingsMfa.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("onboarding.tour.settingsMfa.description")}</p>
          </div>
        ),
        selectorId: TOUR_STEP_IDS.SETTINGS_MFA,
        position: "right" as const,
      },
      // Settings - MFA Credentials
      {
        content: (
          <div>
            <h3 className="font-semibold mb-2">{t("onboarding.tour.settingsMfaCredentials.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("onboarding.tour.settingsMfaCredentials.description")}</p>
          </div>
        ),
        selectorId: TOUR_STEP_IDS.SETTINGS_MFA_CREDENTIALS,
        position: "right" as const,
      },
    ]
    setSteps(steps)
  }, [setSteps, t])

  React.useEffect(() => {
    if (!isLoading && onboardingStatus) {
      // Show alert if user is new and hasn't completed onboarding
      if (onboardingStatus.isNewUser && !onboardingStatus.hasCompletedOnboarding && !onboardingStatus.skippedOnboarding) {
        setShowAlert(true)
      }
    }
  }, [onboardingStatus, isLoading])

  const handleSkipTour = React.useCallback(async () => {
    try {
      await updateOnboardingMutation.mutateAsync({
        skipped: true,
      })
      // Refetch onboarding status to update the UI
      await refetch()
      setShowAlert(false)
    } catch (error) {
      console.error("Failed to skip onboarding:", error)
    }
  }, [updateOnboardingMutation, refetch])

  return (
    <>
      {children}
      <TourAlertDialog 
        isOpen={showAlert} 
        setIsOpen={setShowAlert}
        onSkip={handleSkipTour}
      />
    </>
  )
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const updateOnboardingMutation = trpc.users.updateOnboardingStatus.useMutation()
  
  const handleTourComplete = React.useCallback(async () => {
    await updateOnboardingMutation.mutateAsync({
      completed: true,
    })
  }, [updateOnboardingMutation])

  return (
    <TourProvider onComplete={handleTourComplete}>
      <OnboardingContent>{children}</OnboardingContent>
    </TourProvider>
  )
}
