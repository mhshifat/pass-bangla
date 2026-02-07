"use client"

import * as React from "react"
import { useState, useTransition } from "react"
import { useTranslation } from "react-i18next"
import { 
  Download, 
  FileText, 
  Lock, 
  Calendar,
  Folder,
  Tag,
  Loader2,
  CheckCircle2,
  AlertCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { exportPasswordsAction, getExportFiltersAction, type ExportOptions } from "@/app/admin/passwords/export-actions"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface ExportPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

type ExportFormat = "csv" | "json" | "bitwarden" | "lastpass" | "encrypted"

export function ExportPasswordDialog({
  open,
  onOpenChange,
  onSuccess,
}: ExportPasswordDialogProps) {
  const { t } = useTranslation()
  const [format, setFormat] = useState<ExportFormat>("csv")
  const [folderId, setFolderId] = useState<string>("all")
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")
  const [includeShared, setIncludeShared] = useState(false)
  const [encryptionKey, setEncryptionKey] = useState("")
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [filters, setFilters] = useState<{ folders: Array<{ id: string; name: string }>; tags: Array<{ id: string; name: string; color?: string | null }> } | null>(null)

  // Load filters on dialog open
  React.useEffect(() => {
    if (open && !filters) {
      getExportFiltersAction().then(setFilters).catch(() => {
        setError(t("passwords.export.loadFiltersError"))
      })
    }
  }, [open, filters, t])

  const handleExport = async () => {
    if (format === "encrypted" && !encryptionKey.trim()) {
      setError(t("passwords.export.encryptionKeyRequired"))
      return
    }

    setIsExporting(true)
    setError(null)

    const options: ExportOptions = {
      format,
      folderId: folderId && folderId !== "all" ? folderId : undefined,
      tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      includeShared,
      encryptionKey: format === "encrypted" ? encryptionKey : undefined,
    }

    startTransition(async () => {
      try {
        const result = await exportPasswordsAction(options)

        // Create download
        const blob = new Blob([result.content], { type: result.mimeType })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        const timestamp = new Date().toISOString().split("T")[0]
        link.download = `passwords-export-${timestamp}.${result.fileExtension}`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        toast.success(
          t("passwords.export.success", { count: result.count })
        )
        onSuccess?.()
        handleClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : t("passwords.export.exportError"))
      } finally {
        setIsExporting(false)
      }
    })
  }

  const handleClose = () => {
    setFormat("csv")
    setFolderId("all")
    setSelectedTagIds([])
    setDateFrom("")
    setDateTo("")
    setIncludeShared(false)
    setEncryptionKey("")
    setError(null)
    onOpenChange(false)
  }

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Download className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-2xl">{t("passwords.export.title")}</DialogTitle>
              <DialogDescription className="mt-1">
                {t("passwords.export.description")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4 pr-2">
          {/* Export Format */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {t("passwords.export.format")}
                </Label>
                <Select value={format} onValueChange={(value) => setFormat(value as ExportFormat)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="bitwarden">Bitwarden</SelectItem>
                    <SelectItem value="lastpass">LastPass</SelectItem>
                    <SelectItem value="encrypted">{t("passwords.export.encrypted")}</SelectItem>
                  </SelectContent>
                </Select>
                {format === "encrypted" && (
                  <Alert>
                    <Lock className="h-4 w-4" />
                    <AlertDescription>
                      {t("passwords.export.encryptedDescription")}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {/* Encryption Key */}
              {format === "encrypted" && (
                <div className="space-y-2">
                  <Label htmlFor="encryptionKey">
                    {t("passwords.export.encryptionKey")}
                  </Label>
                  <PasswordInput
                    id="encryptionKey"
                    value={encryptionKey}
                    onChange={(e) => setEncryptionKey(e.target.value)}
                    placeholder={t("passwords.export.encryptionKeyPlaceholder")}
                    showToggleButton={true}
                    showGenerateButton={false}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Filters */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <Label className="text-base font-semibold">{t("passwords.export.filters")}</Label>

              {/* Folder Filter */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm">
                  <Folder className="h-4 w-4" />
                  {t("passwords.folder")}
                </Label>
                <Select value={folderId || "all"} onValueChange={(value) => setFolderId(value === "all" ? "" : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("passwords.export.allFolders")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("passwords.export.allFolders")}</SelectItem>
                    {filters?.folders.map((folder) => (
                      <SelectItem key={folder.id} value={folder.id}>
                        {folder.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tags Filter */}
              {filters && filters.tags.length > 0 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm">
                    <Tag className="h-4 w-4" />
                    {t("passwords.export.tags")}
                  </Label>
                  <ScrollArea className="h-32 border rounded-md p-2">
                    <div className="flex flex-wrap gap-2">
                      {filters.tags.map((tag) => (
                        <div
                          key={tag.id}
                          className="flex items-center space-x-2"
                        >
                          <Checkbox
                            id={`tag-${tag.id}`}
                            checked={selectedTagIds.includes(tag.id)}
                            onCheckedChange={() => toggleTag(tag.id)}
                          />
                          <Label
                            htmlFor={`tag-${tag.id}`}
                            className="text-sm font-normal cursor-pointer flex items-center gap-1"
                          >
                            {tag.color && (
                              <span
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: tag.color }}
                              />
                            )}
                            {tag.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Date Range Filter */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4" />
                  {t("passwords.export.dateRange")}
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {t("passwords.export.from")}
                    </Label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {t("passwords.export.to")}
                    </Label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Include Shared */}
              <div className="flex items-center justify-between p-3 border rounded-md">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">
                    {t("passwords.export.includeShared")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("passwords.export.includeSharedDescription")}
                  </p>
                </div>
                <Switch
                  checked={includeShared}
                  onCheckedChange={setIncludeShared}
                />
              </div>
            </CardContent>
          </Card>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={handleClose} disabled={isExporting || isPending}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting || isPending}
            size="lg"
          >
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("passwords.export.exporting")}
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                {t("passwords.export.export")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
