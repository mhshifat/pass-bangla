"use client"

import * as React from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Search, FolderKey, Star, Loader2, Globe, Zap } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { trpc } from "@/trpc/client"
import type { RouterOutputs } from "@/trpc/client"
import { usePasswordSearchWorker } from "@/hooks/use-password-search-worker"
import { PasswordDetailsDialog } from "./password-details-dialog"

type IndexedPassword = RouterOutputs["passwords"]["searchIndex"]["passwords"][number]

interface InstantSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ROW_HEIGHT = 64

export function InstantSearchDialog({ open, onOpenChange }: InstantSearchDialogProps) {
  // Full metadata is fetched once and cached (5 min) — no secrets, ids + labels only.
  const { data, isLoading } = trpc.passwords.searchIndex.useQuery(undefined, {
    enabled: open,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })

  const records = React.useMemo<IndexedPassword[]>(() => data?.passwords ?? [], [data])
  const { query, setQuery, results } = usePasswordSearchWorker(records, 200)

  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const [detailPassword, setDetailPassword] = React.useState<IndexedPassword | null>(null)
  const [isDetailOpen, setIsDetailOpen] = React.useState(false)

  const parentRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  // Reset selection + refocus when opening or when the result set changes.
  React.useEffect(() => {
    if (open) {
      setSelectedIndex(0)
      const id = setTimeout(() => inputRef.current?.focus(), 30)
      return () => clearTimeout(id)
    }
  }, [open])

  React.useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const openDetails = React.useCallback((p: IndexedPassword) => {
    setDetailPassword(p)
    setIsDetailOpen(true)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (results.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((i) => {
        const next = Math.min(i + 1, results.length - 1)
        rowVirtualizer.scrollToIndex(next)
        return next
      })
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((i) => {
        const next = Math.max(i - 1, 0)
        rowVirtualizer.scrollToIndex(next)
        return next
      })
    } else if (e.key === "Enter") {
      e.preventDefault()
      const p = results[selectedIndex]
      if (p) openDetails(p)
    }
  }

  const total = data?.total ?? 0
  const truncated = data?.truncated ?? false

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] p-0 gap-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Instant search</DialogTitle>
            <DialogDescription>Search your entire vault instantly.</DialogDescription>
          </DialogHeader>

          {/* Search input */}
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Zap className="h-4 w-4 text-primary shrink-0" />
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Instant search across your whole vault…"
              className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-0 px-0"
            />
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
          </div>

          {/* Virtualized results */}
          <div ref={parentRef} className="max-h-[52vh] min-h-[200px] overflow-y-auto">
            {results.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                {isLoading ? "Loading your vault…" : "No matches"}
              </div>
            ) : (
              <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
                {rowVirtualizer.getVirtualItems().map((vi) => {
                  const p = results[vi.index]
                  if (!p) return null
                  const isSelected = vi.index === selectedIndex
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onMouseEnter={() => setSelectedIndex(vi.index)}
                      onClick={() => openDetails(p)}
                      className={cn(
                        "absolute left-0 top-0 flex w-full items-center gap-3 px-4 text-left transition-colors",
                        isSelected ? "bg-muted" : "hover:bg-muted/60"
                      )}
                      style={{ height: vi.size, transform: `translateY(${vi.start}px)` }}
                    >
                      <FolderKey className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {p.isFavorite && (
                            <Star className="h-3.5 w-3.5 shrink-0 fill-yellow-400 text-yellow-400" />
                          )}
                          <span className="truncate text-sm font-medium">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="truncate font-mono">{p.username}</span>
                          {p.url && (
                            <span className="flex items-center gap-1 truncate">
                              <Globe className="h-3 w-3 shrink-0" />
                              {p.url}
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 text-[10px]",
                          p.strength === "weak" && "border-red-500/40 text-red-600",
                          p.strength === "medium" && "border-yellow-500/40 text-yellow-600",
                          p.strength === "strong" && "border-green-500/40 text-green-600"
                        )}
                      >
                        {p.strength}
                      </Badge>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
            <span>
              {results.length} shown · {total} in vault
              {truncated && " (searching newest 5,000)"}
            </span>
            <span className="hidden sm:flex items-center gap-3">
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">↑↓</kbd> navigate
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">↵</kbd> open
            </span>
          </div>
        </DialogContent>
      </Dialog>

      <PasswordDetailsDialog
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        password={detailPassword as Parameters<typeof PasswordDetailsDialog>[0]["password"]}
      />
    </>
  )
}
