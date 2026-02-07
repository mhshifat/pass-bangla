"use client"

import * as React from "react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { FileText, Search, Sparkles, Building2, Globe, Lock, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { trpc } from "@/trpc/client"
import { cn } from "@/lib/utils"

interface TemplateSelectorProps {
  onSelectTemplate?: (template: {
    id: string
    name: string
    defaultFields: {
      name?: string
      username?: string
      url?: string
      notes?: string
    }
  }) => void
  className?: string
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Cloud: <Building2 className="h-4 w-4" />,
  Social: <Globe className="h-4 w-4" />,
  Banking: <Lock className="h-4 w-4" />,
  Email: <Globe className="h-4 w-4" />,
  Development: <FileText className="h-4 w-4" />,
}

export function TemplateSelector({ onSelectTemplate, className }: TemplateSelectorProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const { data, isLoading } = trpc.passwords.listTemplates.useQuery({
    includeSystem: true,
    includePublic: true,
    includeOwn: true,
  })

  const templates = data?.templates || []

  // Group templates by category
  const groupedTemplates = React.useMemo(() => {
    const groups: Record<string, typeof templates> = {}
    templates.forEach((template) => {
      const category = template.category || t("passwords.templates.uncategorized")
      if (!groups[category]) {
        groups[category] = []
      }
      groups[category].push(template)
    })
    return groups
  }, [templates, t])

  // Filter templates by search query
  const filteredTemplates = React.useMemo(() => {
    if (!searchQuery) return templates

    const query = searchQuery.toLowerCase()
    return templates.filter(
      (template) =>
        template.name.toLowerCase().includes(query) ||
        template.service?.toLowerCase().includes(query) ||
        template.description?.toLowerCase().includes(query) ||
        template.category?.toLowerCase().includes(query)
    )
  }, [templates, searchQuery])

  const useTemplateMutation = trpc.passwords.useTemplate.useMutation({
    onSuccess: (result) => {
      onSelectTemplate?.(result.template)
      setOpen(false)
    },
    onError: (error) => {
      console.error("Failed to use template:", error)
    },
  })

  const handleSelectTemplate = (template: (typeof templates)[number]) => {
    useTemplateMutation.mutate({ id: template.id })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-2", className)}
        >
          <Sparkles className="h-4 w-4" />
          {t("passwords.templates.useTemplate")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput
            placeholder={t("passwords.templates.searchTemplates")}
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            {isLoading ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                {t("common.loading")}
              </div>
            ) : filteredTemplates.length === 0 ? (
              <CommandEmpty>
                {searchQuery
                  ? t("passwords.templates.noTemplatesFound")
                  : t("passwords.templates.noTemplates")}
              </CommandEmpty>
            ) : searchQuery ? (
              <CommandGroup heading={t("passwords.templates.searchResults")}>
                {filteredTemplates.map((template) => (
                  <CommandItem
                    key={template.id}
                    value={template.id}
                    onSelect={() => handleSelectTemplate(template)}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    {template.icon && (
                      <span className="text-lg shrink-0">{template.icon}</span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{template.name}</span>
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
                      </div>
                      {template.service && (
                        <div className="text-xs text-muted-foreground truncate">
                          {template.service}
                        </div>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
                <CommandGroup key={category} heading={category}>
                  {categoryTemplates.map((template) => (
                    <CommandItem
                      key={template.id}
                      value={template.id}
                      onSelect={() => handleSelectTemplate(template)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      {template.icon && (
                        <span className="text-lg shrink-0">{template.icon}</span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{template.name}</span>
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
                        </div>
                        {template.service && (
                          <div className="text-xs text-muted-foreground truncate">
                            {template.service}
                          </div>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
