"use client"

import * as React from "react"
import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslation } from "react-i18next"
import { Tag, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { trpc } from "@/trpc/client"

export function TagFilter() {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)

  // Get selected tags from URL
  const selectedTagIds = React.useMemo(() => {
    const tagsParam = searchParams.get("tags")
    return tagsParam ? tagsParam.split(",").filter(Boolean) : []
  }, [searchParams])

  // Fetch all tags (uses SSR prefetch when available)
  const { data: tagsData } = trpc.passwords.getExportFilters.useQuery(undefined, {
    staleTime: 60_000, // 1 minute - use SSR prefetched data
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const tags = tagsData?.tags || []

  const handleTagToggle = (tagId: string) => {
    const params = new URLSearchParams(searchParams)
    const currentTags = selectedTagIds

    let newTags: string[]
    if (currentTags.includes(tagId)) {
      newTags = currentTags.filter((id) => id !== tagId)
    } else {
      newTags = [...currentTags, tagId]
    }

    if (newTags.length > 0) {
      params.set("tags", newTags.join(","))
    } else {
      params.delete("tags")
    }
    params.set("page", "1") // Reset to first page
    router.push(`?${params.toString()}`)
  }

  const handleClearAll = () => {
    const params = new URLSearchParams(searchParams)
    params.delete("tags")
    params.set("page", "1")
    router.push(`?${params.toString()}`)
  }

  const selectedTags = tags.filter((tag) => selectedTagIds.includes(tag.id))

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9">
            <Tag className="h-4 w-4 mr-2" />
            {t("passwords.tags.filterByTags")}
            {selectedTagIds.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {selectedTagIds.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder={t("passwords.tags.searchTags")} />
            <CommandList>
              <CommandEmpty>{t("passwords.tags.noTagsFound")}</CommandEmpty>
              <CommandGroup>
                <ScrollArea className="h-64">
                  <div className="p-2 space-y-2">
                    {tags.map((tag) => (
                      <CommandItem
                        key={tag.id}
                        value={tag.name}
                        onSelect={() => handleTagToggle(tag.id)}
                        className="cursor-pointer"
                      >
                        {/* Presentational only — the CommandItem's onSelect
                            handles toggling. Wiring onCheckedChange here too made
                            a checkbox click fire handleTagToggle twice, cancelling
                            the toggle so the filter appeared to do nothing. */}
                        <Checkbox
                          checked={selectedTagIds.includes(tag.id)}
                          className="mr-2 pointer-events-none"
                          tabIndex={-1}
                        />
                        <div className="flex items-center gap-2 flex-1">
                          {tag.color && (
                            <span
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: tag.color }}
                            />
                          )}
                          {tag.icon && (
                            <span className="text-xs shrink-0">{tag.icon}</span>
                          )}
                          <span className="flex-1 text-sm">{tag.name}</span>
                        </div>
                      </CommandItem>
                    ))}
                  </div>
                </ScrollArea>
              </CommandGroup>
              {selectedTagIds.length > 0 && (
                <div className="border-t p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearAll}
                    className="w-full"
                  >
                    <X className="h-4 w-4 mr-2" />
                    {t("passwords.tags.clearFilters")}
                  </Button>
                </div>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
