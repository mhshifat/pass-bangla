"use client"

import * as React from "react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Plus, Search, Edit2, Trash2, Sparkles, Building2, Globe, Lock, Mail, Code, CreditCard, Gamepad2, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TemplateManagementDialog } from "@/modules/passwords/client"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
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
import { usePermissions } from "@/hooks/use-permissions"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { showErrorFromException } from "@/lib/error-toast"

const CATEGORIES = [
  { value: "Cloud", label: "Cloud", icon: Building2 },
  { value: "Social", label: "Social Media", icon: Globe },
  { value: "Banking", label: "Banking", icon: CreditCard },
  { value: "Email", label: "Email", icon: Mail },
  { value: "Development", label: "Development", icon: Code },
  { value: "Gaming", label: "Gaming", icon: Gamepad2 },
  { value: "Other", label: "Other", icon: FileText },
]

interface PasswordTemplate {
  id: string
  name: string
  service?: string | null
  description?: string | null
  category?: string | null
  icon?: string | null
  isSystem?: boolean
  isPublic?: boolean
  ownerId?: string | null
  [key: string]: unknown
}

export function TemplatesPageClient() {
  const { t } = useTranslation()
  const { hasPermission } = usePermissions()
  const isMobile = useIsMobile()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [editingTemplate, setEditingTemplate] = useState<PasswordTemplate | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [templateToDelete, setTemplateToDelete] = useState<{ id: string; name: string } | null>(null)

  const { data, isLoading, refetch } = trpc.passwords.listTemplates.useQuery({
    includeSystem: true,
    includePublic: true,
    includeOwn: true,
    category: selectedCategory !== "all" ? selectedCategory : undefined,
  })

  const templates = data?.templates || []

  // Filter templates by search query
  const filteredTemplates = React.useMemo(() => {
    const templateList = data?.templates || []
    if (!searchQuery) return templateList

    const query = searchQuery.toLowerCase()
    return templateList.filter(
      (template) =>
        template.name.toLowerCase().includes(query) ||
        template.service?.toLowerCase().includes(query) ||
        template.description?.toLowerCase().includes(query)
    )
  }, [data?.templates, searchQuery])

  // Group templates by category
  const groupedTemplates = React.useMemo(() => {
    const groups: Record<string, typeof filteredTemplates> = {}
    filteredTemplates.forEach((template) => {
      const category = template.category || t("passwords.templates.uncategorized")
      if (!groups[category]) {
        groups[category] = []
      }
      groups[category].push(template)
    })
    return groups
  }, [filteredTemplates, t])

  const deleteTemplateMutation = trpc.passwords.deleteTemplate.useMutation({
    onSuccess: async () => {
      toast.success(t("passwords.templates.deleted"))
      await refetch()
      setDeleteDialogOpen(false)
      setTemplateToDelete(null)
    },
    onError: (error) => {
      showErrorFromException(error, t("passwords.templates.deleteError"))
    },
  })

  const handleDelete = () => {
    if (!templateToDelete) return
    deleteTemplateMutation.mutate({ id: templateToDelete.id })
  }

  const canCreate = hasPermission("password.create")
  const canEdit = hasPermission("password.edit")
  const canDelete = hasPermission("password.delete")

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">{t("passwords.templates.title")}</h1>
            <p className="text-muted-foreground mt-1">
              {t("passwords.templates.description")}
            </p>
          </div>
          {canCreate && (
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("passwords.templates.createTemplate")}
            </Button>
          )}
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("passwords.templates.searchTemplates")}
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder={t("passwords.templates.allCategories")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("passwords.templates.allCategories")}</SelectItem>
                  {CATEGORIES.map((category) => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
        </Card>

        {/* Templates Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="h-6 w-32 bg-muted animate-pulse rounded" />
                </CardHeader>
                <CardContent>
                  <div className="h-4 w-full bg-muted animate-pulse rounded mb-2" />
                  <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredTemplates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {searchQuery || selectedCategory !== "all"
                  ? t("passwords.templates.noTemplatesFound")
                  : t("passwords.templates.noTemplates")}
              </h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
                {searchQuery || selectedCategory !== "all"
                  ? t("passwords.templates.noTemplatesFoundDescription")
                  : t("passwords.templates.noTemplatesDescription")}
              </p>
              {canCreate && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("passwords.templates.createTemplate")}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => {
              const CategoryIcon = CATEGORIES.find((c) => c.value === category)?.icon || FileText
              return (
                <div key={category} className="space-y-4">
                  <div className="flex items-center gap-2">
                    <CategoryIcon className="h-5 w-5 text-muted-foreground" />
                    <h2 className="text-xl font-semibold">{category}</h2>
                    <Badge variant="secondary" className="ml-auto">
                      {categoryTemplates.length}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {categoryTemplates.map((template) => (
                      <Card
                        key={template.id}
                        className="hover:shadow-md transition-shadow cursor-pointer group"
                      >
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              {template.icon && (
                                <span className="text-2xl shrink-0">{template.icon}</span>
                              )}
                              <div className="flex-1 min-w-0">
                                <CardTitle className="text-base truncate">{template.name}</CardTitle>
                                {template.service && (
                                  <CardDescription className="truncate">
                                    {template.service}
                                  </CardDescription>
                                )}
                              </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className={cn(
                                    "h-8 w-8 transition-opacity",
                                    isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                  )}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {canEdit && template.ownerId && (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setEditingTemplate(template)
                                    }}
                                  >
                                    <Edit2 className="mr-2 h-4 w-4" />
                                    {t("common.edit")}
                                  </DropdownMenuItem>
                                )}
                                {canDelete && template.ownerId && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-red-600"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setTemplateToDelete({ id: template.id, name: template.name })
                                        setDeleteDialogOpen(true)
                                      }}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      {t("common.delete")}
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CardHeader>
                        <CardContent>
                          {template.description && (
                            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                              {template.description}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {template.isSystem && (
                              <Badge variant="secondary" className="text-xs">
                                {t("passwords.templates.system")}
                              </Badge>
                            )}
                            {template.isPublic && !template.isSystem && (
                              <Badge variant="outline" className="text-xs">
                                {t("passwords.templates.public")}
                              </Badge>
                            )}
                            {template.usageCount > 0 && (
                              <Badge variant="outline" className="text-xs">
                                {t("passwords.templates.used", { count: template.usageCount })}
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <TemplateManagementDialog
        open={isCreateDialogOpen || !!editingTemplate}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open)
          if (!open) {
            setEditingTemplate(null)
          }
        }}
        template={editingTemplate}
        onSuccess={async () => {
          await refetch()
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open)
        if (!open) {
          setTemplateToDelete(null)
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("passwords.templates.deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {templateToDelete ? (
                <>
                  {t("passwords.templates.deleteConfirmDescription")}
                  <br />
                  <br />
                  <strong className="font-semibold">{templateToDelete.name}</strong>
                </>
              ) : (
                t("passwords.templates.deleteConfirmDescription")
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTemplateToDelete(null)}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteTemplateMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteTemplateMutation.isPending ? t("common.loading") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
