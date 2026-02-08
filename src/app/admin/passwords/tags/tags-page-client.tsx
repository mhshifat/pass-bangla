"use client"

import * as React from "react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Plus, BarChart3, TagIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { trpc } from "@/trpc/client"
import { showErrorFromException } from "@/lib/error-toast"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { usePermissions } from "@/hooks/use-permissions"
import { deleteTagAction } from "@/app/admin/passwords/tag-actions"
import { useTransition } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Tag } from "@/app/generated"
import { TagManagementDialog } from "@/modules/passwords/client"

export function TagsPageClient() {
  const { t } = useTranslation()
  const { hasPermission } = usePermissions()
  const [isPending, startTransition] = useTransition()
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null)
  const utils = trpc.useUtils()

  // Fetch tag analytics
  const { data: analytics, isLoading: analyticsLoading } = trpc.passwords.tagAnalytics.useQuery(
    { limit: 20 },
    { enabled: hasPermission("password.view") }
  )

  // Fetch all tags
  const { data: allTagsData } = trpc.passwords.getExportFilters.useQuery(
    undefined,
    { enabled: hasPermission("password.view") }
  )

  const allTags = allTagsData?.tags || []

  const handleCreateTag = () => {
    setEditingTag(null)
    setIsTagDialogOpen(true)
  }

  const handleEditTag = (tag: Tag) => {
    setEditingTag(tag)
    setIsTagDialogOpen(true)
  }

  const handleTagSuccess = async () => {
    setIsTagDialogOpen(false)
    setEditingTag(null)
    // Invalidate queries
    await utils.passwords.getExportFilters.invalidate()
    await utils.passwords.tagAnalytics.invalidate()
    await utils.passwords.tagAutocomplete.invalidate()
    await utils.passwords.tagSuggestions.invalidate()
  }

  const handleDeleteTag = (tagId: string) => {
    setDeletingTagId(tagId)
  }

  const confirmDelete = () => {
    if (!deletingTagId) return

    startTransition(async () => {
      try {
        const result = await deleteTagAction(deletingTagId)
        if (result.success) {
          toast.success(t("passwords.tags.tagDeleted"))
          setDeletingTagId(null)
          await utils.passwords.getExportFilters.invalidate()
          await utils.passwords.tagAnalytics.invalidate()
        } else {
          showErrorFromException(result.error, t("passwords.tags.tagDeleteError"))
        }
      } catch (error) {
        showErrorFromException(error, t("passwords.tags.tagDeleteError"))
      }
    })
  }

  if (!hasPermission("password.view")) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <TagIcon className="h-8 w-8" />
            {t("passwords.tags.title")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("passwords.tags.description")}
          </p>
        </div>
        {hasPermission("password.edit") && (
          <Button onClick={handleCreateTag}>
            <Plus className="h-4 w-4 mr-2" />
            {t("passwords.tags.createTag")}
          </Button>
        )}
      </div>

      {/* Analytics Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            {t("passwords.tags.analytics")}
          </CardTitle>
          <CardDescription>
            {t("passwords.tags.analyticsDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analyticsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : !analytics || analytics.length === 0 ? (
            <Alert>
              <TagIcon className="h-4 w-4" />
              <AlertDescription>
                {t("passwords.tags.noAnalytics")}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {analytics.map((tag) => (
                <div key={tag.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {tag.color && (
                        <span
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                      )}
                      {tag.icon && <span className="text-sm">{tag.icon}</span>}
                      <span className="font-medium">{tag.name}</span>
                      <Badge variant="secondary">
                        {tag.usageCount} {t("passwords.tags.passwords")}
                      </Badge>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {tag.usagePercentage}%
                    </span>
                  </div>
                  <Progress value={tag.usagePercentage} className="h-2" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* All Tags Card */}
      <Card>
        <CardHeader>
          <CardTitle>{t("passwords.tags.allTags")}</CardTitle>
          <CardDescription>
            {t("passwords.tags.allTagsDescription", { count: allTags.length })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {allTags.length === 0 ? (
            <Alert>
              <TagIcon className="h-4 w-4" />
              <AlertDescription>
                {t("passwords.tags.noTags")}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  className="flex items-center gap-2"
                >
                  {tag.color && (
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                  )}
                  {tag.icon && <span className="text-xs">{tag.icon}</span>}
                  <span>{tag.name}</span>
                  {hasPermission("password.edit") && (
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        type="button"
                        onClick={() => handleEditTag(tag as Tag)}
                        className="text-xs hover:underline"
                      >
                        {t("common.edit")}
                      </button>
                      <span className="text-muted-foreground">|</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteTag(tag.id)}
                        className="text-xs hover:underline text-red-600"
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  )}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <TagManagementDialog
        open={isTagDialogOpen}
        onOpenChange={setIsTagDialogOpen}
        tag={editingTag}
        onSuccess={handleTagSuccess}
      />

      <AlertDialog open={deletingTagId !== null} onOpenChange={(open) => !open && setDeletingTagId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("passwords.tags.deleteTag")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("passwords.tags.deleteTagDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingTagId(null)}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {isPending ? t("common.loading") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
