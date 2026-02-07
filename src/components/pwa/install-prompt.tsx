"use client"

import * as React from "react"
import { Download, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const STORAGE_KEY = "pwa-install-dismissed"

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = React.useState(false)
  const [isInstalled, setIsInstalled] = React.useState(false)
  // Check localStorage on initial render
  const [isDismissed, setIsDismissed] = React.useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem(STORAGE_KEY) === "true"
  })

  React.useEffect(() => {
    // Check if user has previously dismissed the prompt
    if (isDismissed) {
      return
    }

    // Check if app is already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true)
      return
    }

    // Check if running on iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & {MSStream?: unknown}).MSStream
    if (isIOS) {
      // Show iOS install instructions (only if not dismissed)
      if (!isDismissed) {
        setShowPrompt(true)
      }
      return
    }

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Only show if not previously dismissed
      if (!isDismissed) {
        setShowPrompt(true)
      }
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)

    // Check if already installed
    const checkInstalled = () => {
      if (window.matchMedia("(display-mode: standalone)").matches) {
        setIsInstalled(true)
        setShowPrompt(false)
      }
    }

    checkInstalled()
    window.addEventListener("appinstalled", () => {
      setIsInstalled(true)
      setShowPrompt(false)
      setDeferredPrompt(null)
      // Clear dismissed flag if user installs
      localStorage.removeItem(STORAGE_KEY)
    })

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    }
  }, [isDismissed])

  const handleInstall = async () => {
    if (!deferredPrompt) {
      // iOS instructions
      return
    }

    deferredPrompt.prompt()
    const { outcome } = await (deferredPrompt.userChoice as Promise<{outcome: string}>)

    if (outcome === "accepted") {
      setShowPrompt(false)
      setDeferredPrompt(null)
      // Clear dismissed flag if user installs
      localStorage.removeItem(STORAGE_KEY)
    } else if (outcome === "dismissed") {
      // User dismissed the native browser prompt
      handleDismiss()
    }
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    setIsDismissed(true)
    // Remember that user dismissed the prompt
    localStorage.setItem(STORAGE_KEY, "true")
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & {MSStream?: unknown}).MSStream

  // Don't show if installed, dismissed, or no prompt available
  if (isInstalled || isDismissed || (!deferredPrompt && !isIOS)) {
    return null
  }

  return (
    <Dialog open={showPrompt} onOpenChange={(open) => {
      if (!open) {
        // User closed the dialog (clicked outside or pressed ESC)
        handleDismiss()
      } else {
        setShowPrompt(open)
      }
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Install PassBangla
          </DialogTitle>
          <DialogDescription>
            {isIOS ? (
              <div className="space-y-3 mt-2">
                <p>Install PassBangla on your iOS device:</p>
                <ol className="list-decimal list-inside space-y-2 text-sm">
                  <li>Tap the Share button <span className="font-semibold">(□↑)</span> at the bottom</li>
                  <li>Scroll down and tap <span className="font-semibold">&quot;Add to Home Screen&quot;</span></li>
                  <li>Tap <span className="font-semibold">&quot;Add&quot;</span> in the top right</li>
                </ol>
              </div>
            ) : (
              "Install PassBangla for a better experience with offline access and faster loading."
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={handleDismiss}>
            <X className="h-4 w-4 mr-2" />
            Not Now
          </Button>
          {!isIOS && (
            <Button onClick={handleInstall}>
              <Download className="h-4 w-4 mr-2" />
              Install
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

