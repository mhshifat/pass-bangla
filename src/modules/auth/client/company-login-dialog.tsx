"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FormErrorDisplay } from "@/components/shared/form-error-display"
import { Loader2 } from "lucide-react"
import { findCompanySubdomain } from "./find-company-action"

interface CompanyLoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CompanyLoginDialog({ open, onOpenChange }: CompanyLoginDialogProps) {
  const { t } = useTranslation()
  const [companyName, setCompanyName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const subdomain = await findCompanySubdomain(companyName.trim())
      
      if (subdomain) {
        // Get current host to determine base domain
        const host = window.location.host
        const protocol = window.location.protocol
        let baseDomain = "localhost:3000"
        
        if (!host.includes("localhost")) {
          const parts = host.split(".")
          if (parts.length >= 2) {
            baseDomain = parts.slice(-2).join(".")
          } else {
            baseDomain = host
          }
        }
        
        // Redirect to subdomain login
        const subdomainUrl = `${protocol}//${subdomain}.${baseDomain}/login`
        window.location.href = subdomainUrl
      } else {
        setError(t("auth.companyNotFound"))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.companyNotFound"))
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!isLoading) {
      setCompanyName("")
      setError(null)
      onOpenChange(newOpen)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("auth.findYourCompany")}</DialogTitle>
          <DialogDescription>{t("auth.findYourCompanyDescription")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="companyName">{t("auth.companyName")}</Label>
            <Input
              id="companyName"
              type="text"
              placeholder={t("auth.companyNamePlaceholder")}
              value={companyName}
              onChange={(e) => {
                const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-")
                setCompanyName(value)
                setError(null)
              }}
              disabled={isLoading}
              required
            />
          </div>
          
          <FormErrorDisplay error={error} />

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isLoading}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isLoading || !companyName.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("common.searching")}
                </>
              ) : (
                t("common.continue")
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
