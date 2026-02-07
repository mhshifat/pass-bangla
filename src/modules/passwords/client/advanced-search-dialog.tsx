"use client"

import * as React from "react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useTranslation } from "react-i18next"
import { Search, X, Save, History, FolderTree, Tag as TagIcon, Filter, Bookmark } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { TagAutocomplete } from "./tag-autocomplete"
import { SavedSearches } from "./saved-searches"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { showErrorFromException } from "@/lib/error-toast"

const advancedSearchSchema = z.object({
  query: z.string().optional(),
  searchFields: z.array(z.enum(["name", "username", "url", "notes"])).optional(),
  folderIds: z.array(z.string()).optional(),
  tagIds: z.array(z.string()).optional(),
  filter: z.enum(["weak", "expiring", "favorites"]).optional(),
  saveAsName: z.string().optional(),
})

type AdvancedSearchFormValues = z.infer<typeof advancedSearchSchema>

interface AdvancedSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSearch?: (params: AdvancedSearchFormValues) => void
  initialValues?: Partial<AdvancedSearchFormValues>
  onSave?: (params: AdvancedSearchFormValues) => void | Promise<void>
  mode?: "search" | "edit"
  searchName?: string
}

export function AdvancedSearchDialog({
  open,
  onOpenChange,
  onSearch,
  initialValues,
  onSave,
  mode = "search",
  searchName,
}: AdvancedSearchDialogProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const utils = trpc.useUtils()

  // Get current search params
  const currentQuery = searchParams.get("search") || ""
  const currentTagIds = searchParams.get("tags")?.split(",").filter(Boolean) || []
  const currentFilter = searchParams.get("filter") as "weak" | "expiring" | "favorites" | null

  const form = useForm<AdvancedSearchFormValues>({
    resolver: zodResolver(advancedSearchSchema),
    defaultValues: {
      query: initialValues?.query ?? currentQuery,
      searchFields: initialValues?.searchFields ?? ["name", "username", "url", "notes"],
      folderIds: initialValues?.folderIds ?? [],
      tagIds: initialValues?.tagIds ?? currentTagIds,
      filter: initialValues?.filter ?? currentFilter ?? undefined,
      saveAsName: searchName || "",
    },
  })

  // Reset form when initialValues change
  React.useEffect(() => {
    if (initialValues) {
      form.reset({
        query: initialValues.query ?? "",
        searchFields: initialValues.searchFields ?? ["name", "username", "url", "notes"],
        folderIds: initialValues.folderIds ?? [],
        tagIds: initialValues.tagIds ?? [],
        filter: initialValues.filter ?? undefined,
        saveAsName: searchName || "",
      })
    }
  }, [initialValues, searchName, form])

  const [showSaveOption, setShowSaveOption] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Fetch folders for hierarchy selection
  const { data: foldersData } = trpc.folders.list.useQuery(undefined, {
    enabled: open,
  })

  const folders = foldersData?.folders || []

  // Mutations
  const saveSearchHistoryMutation = trpc.passwords.saveSearchHistory.useMutation()
  const createSavedSearchMutation = trpc.passwords.createSavedSearch.useMutation({
    onSuccess: () => {
      toast.success(t("passwords.search.saved"))
      setShowSaveOption(false)
      form.setValue("saveAsName", "")
      setIsSaving(false)
    },
    onError: (error) => {
      showErrorFromException(error, t("passwords.search.saveError"))
      setIsSaving(false)
    },
  })

  const searchFields = form.watch("searchFields") || []
  const tagIds = form.watch("tagIds") || []
  const folderIds = form.watch("folderIds") || []

  const handleSearch = (values: AdvancedSearchFormValues) => {
    const params = new URLSearchParams(searchParams)

    // Set search query
    if (values.query) {
      params.set("search", values.query)
    } else {
      params.delete("search")
    }

    // Set tags
    if (values.tagIds && values.tagIds.length > 0) {
      params.set("tags", values.tagIds.join(","))
    } else {
      params.delete("tags")
    }

    // Set filter
    if (values.filter) {
      params.set("filter", values.filter)
    } else {
      params.delete("filter")
    }

    // Set folders (if we add folderIds to URL params)
    if (values.folderIds && values.folderIds.length > 0) {
      params.set("folders", values.folderIds.join(","))
    } else {
      params.delete("folders")
    }

    // Reset to first page
    params.set("page", "1")

    // Save to search history
    saveSearchHistoryMutation.mutate({
      query: values.query || undefined,
      folderIds: values.folderIds,
      tagIds: values.tagIds,
      filter: values.filter,
      searchFields: values.searchFields,
    })

    router.push(`?${params.toString()}`)
    onSearch?.(values)
    onOpenChange(false)
  }

  const handleClearSearch = () => {
    const params = new URLSearchParams()
    params.set("page", "1")
    router.push(`?${params.toString()}`)
    onSearch?.({
      query: "",
      searchFields: ["name", "username", "url", "notes"],
      folderIds: [],
      tagIds: [],
      filter: undefined,
    })
    onOpenChange(false)
  }

  const handleSaveSearch = async (values: AdvancedSearchFormValues) => {
    if (onSave) {
      // If onSave is provided, use it (for editing)
      // Validate name is provided for edit mode
      if (mode === "edit" && (!values.saveAsName || !values.saveAsName.trim())) {
        toast.error(t("passwords.search.saveNameRequired"))
        return
      }
      await onSave(values)
      return
    }

    // Otherwise, create a new saved search
    if (!values.saveAsName || !values.saveAsName.trim()) {
      toast.error(t("passwords.search.saveNameRequired"))
      return
    }

    setIsSaving(true)
    createSavedSearchMutation.mutate({
      name: values.saveAsName.trim(),
      query: values.query || undefined,
      folderIds: values.folderIds,
      tagIds: values.tagIds,
      filter: values.filter,
      searchFields: values.searchFields,
    })
  }

  const toggleSearchField = (field: "name" | "username" | "url" | "notes") => {
    const current = searchFields
    if (current.includes(field)) {
      if (current.length > 1) {
        form.setValue("searchFields", current.filter((f) => f !== field))
      } else {
        toast.error(t("passwords.search.atLeastOneField"))
      }
    } else {
      form.setValue("searchFields", [...current, field])
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            {t("passwords.search.advancedSearch")}
          </DialogTitle>
          <DialogDescription>
            {t("passwords.search.advancedSearchDescription")}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="search" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              {t("passwords.search.search")}
            </TabsTrigger>
            <TabsTrigger value="saved" className="flex items-center gap-2">
              <Bookmark className="h-4 w-4" />
              {t("passwords.search.savedSearches")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="search" className="mt-4">
            <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSearch)} className="space-y-6">
            {/* Search Query */}
            <FormField
              control={form.control}
              name="query"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("passwords.search.searchQuery")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("passwords.search.searchQueryPlaceholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t("passwords.search.searchQueryDescription")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Search Fields */}
            <FormField
              control={form.control}
              name="searchFields"
              render={() => (
                <FormItem>
                  <FormLabel>{t("passwords.search.searchIn")}</FormLabel>
                  <div className="grid grid-cols-2 gap-3">
                    {(["name", "username", "url", "notes"] as const).map((field) => (
                      <div key={field} className="flex items-center space-x-2">
                        <Checkbox
                          id={`field-${field}`}
                          checked={searchFields.includes(field)}
                          onCheckedChange={() => toggleSearchField(field)}
                        />
                        <Label
                          htmlFor={`field-${field}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {t(`passwords.search.field.${field}`)}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <FormDescription>
                    {t("passwords.search.searchFieldsDescription")}
                  </FormDescription>
                </FormItem>
              )}
            />

            <Separator />

            {/* Filters */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Label className="text-base font-semibold">{t("passwords.search.filters")}</Label>
              </div>

              {/* Tag Filter */}
              <FormField
                control={form.control}
                name="tagIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <TagIcon className="h-4 w-4" />
                      {t("passwords.tags.tags")}
                    </FormLabel>
                    <FormControl>
                      <TagAutocomplete
                        selectedTagIds={field.value || []}
                        onTagsChange={field.onChange}
                        placeholder={t("passwords.search.selectTags")}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Folder Filter */}
              <FormField
                control={form.control}
                name="folderIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <FolderTree className="h-4 w-4" />
                      {t("passwords.search.folders")}
                    </FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <div className="border rounded-md p-3 max-h-40 overflow-y-auto">
                          {folders.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-2">
                              {t("passwords.noFolders")}
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {folders.map((folder) => (
                                <div key={folder.id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`folder-${folder.id}`}
                                    checked={folderIds.includes(folder.id)}
                                    onCheckedChange={(checked) => {
                                      const current = field.value || []
                                      if (checked) {
                                        field.onChange([...current, folder.id])
                                      } else {
                                        field.onChange(current.filter((id) => id !== folder.id))
                                      }
                                    }}
                                  />
                                  <Label
                                    htmlFor={`folder-${folder.id}`}
                                    className="text-sm font-normal cursor-pointer flex-1"
                                  >
                                    {folder.name}
                                  </Label>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        {folderIds.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {folderIds.map((folderId) => {
                              const folder = folders.find((f) => f.id === folderId)
                              if (!folder) return null
                              return (
                                <Badge
                                  key={folderId}
                                  variant="secondary"
                                  className="flex items-center gap-1"
                                >
                                  {folder.name}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      field.onChange(folderIds.filter((id) => id !== folderId))
                                    }}
                                    className="ml-1 hover:bg-muted rounded-full p-0.5"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </Badge>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </FormControl>
                    <FormDescription>
                      {t("passwords.search.foldersDescription")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Quick Filters */}
              <FormField
                control={form.control}
                name="filter"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("passwords.search.quickFilters")}</FormLabel>
                    <FormControl>
                      <div className="flex flex-wrap gap-2">
                        {(["weak", "expiring", "favorites"] as const).map((filterValue) => (
                          <Button
                            key={filterValue}
                            type="button"
                            variant={field.value === filterValue ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              field.onChange(field.value === filterValue ? undefined : filterValue)
                            }}
                          >
                            {t(`passwords.filter.${filterValue}`)}
                          </Button>
                        ))}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Save Search Option */}
            {(showSaveOption || mode === "edit") && (
              <div className="space-y-2 p-4 border rounded-md bg-muted/50">
                <FormField
                  control={form.control}
                  name="saveAsName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{mode === "edit" ? t("common.name") : t("passwords.search.saveAsName")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("passwords.search.saveAsNamePlaceholder")}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        {mode === "edit" 
                          ? t("passwords.search.editNameDescription")
                          : t("passwords.search.saveAsNameDescription")
                        }
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex gap-2">
                  {mode === "search" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowSaveOption(false)
                        form.setValue("saveAsName", "")
                      }}
                    >
                      {t("common.cancel")}
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleSaveSearch(form.getValues())}
                    disabled={isSaving}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {isSaving ? t("common.loading") : t("common.save")}
                  </Button>
                </div>
              </div>
            )}

            <DialogFooter className="flex-col sm:flex-row gap-2">
              {mode === "search" && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowSaveOption(!showSaveOption)}
                    className="sm:mr-auto"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {showSaveOption ? t("passwords.search.hideSave") : t("passwords.search.saveSearch")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClearSearch}
                    className="text-muted-foreground"
                  >
                    <X className="mr-2 h-4 w-4" />
                    {t("passwords.search.clearAll")}
                  </Button>
                </>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {t("common.cancel")}
              </Button>
              {mode === "search" && (
                <Button type="submit">
                  <Search className="mr-2 h-4 w-4" />
                  {t("passwords.search.search")}
                </Button>
              )}
            </DialogFooter>
          </form>
        </Form>
          </TabsContent>
          <TabsContent value="saved" className="mt-4">
            <SavedSearches
              onExecute={() => onOpenChange(false)}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
