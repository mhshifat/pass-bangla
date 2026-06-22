"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  Mail,
  MessageCircle,
  Send,
  Facebook,
  Smartphone,
  Share2,
  Copy,
  Check,
  Loader2,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { showErrorFromException } from "@/lib/error-toast"
import { sendOnboardingEmailAction } from "@/app/admin/users/onboarding-actions"
import {
  buildOnboardingText,
  onboardingSubject,
  whatsappShareUrl,
  telegramShareUrl,
  messengerShareUrl,
  smsShareUrl,
  mailtoUrl,
} from "@/lib/onboarding-message"

interface OnboardingShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: { name: string; email: string; password?: string; variant?: "new" | "reminder" } | null
  /** Defaults to `${origin}/login`. */
  loginUrl?: string
}

export function OnboardingShareDialog({
  open,
  onOpenChange,
  user,
  loginUrl,
}: OnboardingShareDialogProps) {
  const [resolvedLoginUrl, setResolvedLoginUrl] = React.useState(loginUrl ?? "")
  const [message, setMessage] = React.useState("")
  const [copied, setCopied] = React.useState(false)
  const [isSendingEmail, setIsSendingEmail] = React.useState(false)
  const [emailSent, setEmailSent] = React.useState(false)

  // Resolve the login URL on the client (tenant-correct origin) and compose the
  // message whenever the dialog opens for a user.
  React.useEffect(() => {
    if (!open || !user) return
    const url =
      loginUrl ||
      (typeof window !== "undefined" ? `${window.location.origin}/login` : "/login")
    setResolvedLoginUrl(url)
    setMessage(
      buildOnboardingText({
        name: user.name,
        email: user.email,
        password: user.password,
        loginUrl: url,
        variant: user.variant,
      })
    )
    setCopied(false)
    setEmailSent(false)
  }, [open, user, loginUrl])

  if (!user) return null

  const subject = onboardingSubject()

  const openExternal = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      toast.success("Onboarding message copied")
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      showErrorFromException(error, "Failed to copy message")
    }
  }

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: subject, text: message })
      } catch {
        /* user cancelled — ignore */
      }
    } else {
      handleCopy()
    }
  }

  const handleSendEmail = async () => {
    setIsSendingEmail(true)
    try {
      const result = await sendOnboardingEmailAction({
        to: user.email,
        name: user.name,
        loginUrl: resolvedLoginUrl,
        password: user.password,
        variant: user.variant,
      })
      if (result.success) {
        setEmailSent(true)
        toast.success(`Welcome email sent to ${user.email}`)
      } else {
        showErrorFromException(result.error, "Failed to send email")
      }
    } catch (error) {
      showErrorFromException(error, "Failed to send email")
    } finally {
      setIsSendingEmail(false)
    }
  }

  const channels: Array<{
    key: string
    label: string
    icon: React.ReactNode
    onClick: () => void
    className?: string
  }> = [
    {
      key: "whatsapp",
      label: "WhatsApp",
      icon: <MessageCircle className="h-4 w-4" />,
      onClick: () => openExternal(whatsappShareUrl(message)),
      className: "hover:border-green-500/50 hover:text-green-600",
    },
    {
      key: "telegram",
      label: "Telegram",
      icon: <Send className="h-4 w-4" />,
      onClick: () => openExternal(telegramShareUrl(resolvedLoginUrl, message)),
      className: "hover:border-sky-500/50 hover:text-sky-600",
    },
    {
      key: "messenger",
      label: "Messenger",
      icon: <Facebook className="h-4 w-4" />,
      onClick: () => openExternal(messengerShareUrl(resolvedLoginUrl)),
      className: "hover:border-blue-500/50 hover:text-blue-600",
    },
    {
      key: "sms",
      label: "SMS",
      icon: <Smartphone className="h-4 w-4" />,
      onClick: () => {
        window.location.href = smsShareUrl(message)
      },
    },
    {
      key: "mailto",
      label: "Mail app",
      icon: <Mail className="h-4 w-4" />,
      onClick: () => {
        window.location.href = mailtoUrl(user.email, subject, message)
      },
    },
    {
      key: "more",
      label: "More…",
      icon: <Share2 className="h-4 w-4" />,
      onClick: handleNativeShare,
    },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {user.variant === "reminder" ? "Share sign-in details" : "Share onboarding details"}
          </DialogTitle>
          <DialogDescription>
            {user.variant === "reminder"
              ? `Send ${user.name} their sign-in link and account details.`
              : `Send ${user.name} their sign-in details and getting-started steps.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Branded email (recommended) */}
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Send a branded welcome email</p>
                <p className="text-xs text-muted-foreground truncate">
                  Delivered to {user.email}
                </p>
              </div>
              <Button onClick={handleSendEmail} disabled={isSendingEmail || emailSent}>
                {isSendingEmail ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : emailSent ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Sent
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Send email
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Login URL */}
          <div className="space-y-1.5">
            <Label htmlFor="onboarding-login-url">Sign-in link</Label>
            <Input
              id="onboarding-login-url"
              value={resolvedLoginUrl}
              onChange={(e) => setResolvedLoginUrl(e.target.value)}
            />
          </div>

          {/* Editable message */}
          <div className="space-y-1.5">
            <Label htmlFor="onboarding-message">Message</Label>
            <Textarea
              id="onboarding-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="font-mono text-xs leading-relaxed"
            />
            <p className="text-xs text-muted-foreground">
              Edits apply to chat, SMS, copy and the mail app — the branded email above uses the template.
            </p>
          </div>

          {/* Channels */}
          <div>
            <Label className="mb-2 block">Share via</Label>
            <div className="grid grid-cols-3 gap-2">
              {channels.map((ch) => (
                <Button
                  key={ch.key}
                  type="button"
                  variant="outline"
                  className={`justify-start gap-2 ${ch.className ?? ""}`}
                  onClick={ch.onClick}
                >
                  {ch.icon}
                  <span className="truncate">{ch.label}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Copy */}
          <Button type="button" variant="secondary" className="w-full gap-2" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy message"}
          </Button>

          {user.password && (
            <p className="text-xs text-muted-foreground">
              ⚠️ This message contains a temporary password. Prefer the branded email, and ask the
              user to change it after first sign-in.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
