"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
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
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Calendar } from "@/components/ui/calendar"
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
import { CalendarIcon, Filter, Search, X, Save, Check, ChevronDown } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { showErrorFromException } from "@/lib/error-toast"
import { useState } from "react"
import { showErrorFromException } from "@/lib/error-toast"

interface AdvancedAuditSearchProps {
  onSearch: (filters: {
    actions?: string[]
    resources?: string[]
    statuses?: string[]
    userIds?: string[]
    ipAddresses?: string[]
    dateRange?: { start: Date; end: Date }
    searchText?: string
    hasDetails?: boolean
  }) => void
  onClear: () => void
}

export function AdvancedAuditSearch({
  onSearch,
  onClear,
}: AdvancedAuditSearchProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [searchText, setSearchText] = useState("")
  const [selectedActions, setSelectedActions] = useState<string[]>([])
  const [selectedResources, setSelectedResources] = useState<string[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [ipAddresses, setIpAddresses] = useState<string[]>([])
  const [dateRange, setDateRange] = useState<{ start?: Date; end?: Date }>({})
  const [hasDetails, setHasDetails] = useState<boolean | undefined>(undefined)

  const { data: actionTypes } = trpc.auditLogs.getActionTypes.useQuery()
  const { data: users } = trpc.auditLogs.getUsers.useQuery()
  const { data: savedSearches } = trpc.auditLogs.getSavedSearches.useQuery()

  const saveSearchMutation = trpc.auditLogs.saveSearch.useMutation({
    onSuccess: () => {
      toast.success(t("audit.advancedSearch.searchSaved"))
      setIsOpen(false)
    },
    onError: (error) => {
      showErrorFromException(
        error,
        t("audit.advancedSearch.saveFailed")
      )
    },
  })

  const handleSearch = () => {
    const filters: Record<string, unknown> = {}
    if (searchText) filters.searchText = searchText
    if (selectedActions.length > 0) filters.actions = selectedActions
    if (selectedResources.length > 0) filters.resources = selectedResources
    if (selectedStatuses.length > 0) filters.statuses = selectedStatuses
    if (selectedUserIds.length > 0) filters.userIds = selectedUserIds
    if (ipAddresses.length > 0) filters.ipAddresses = ipAddresses
    if (dateRange.start && dateRange.end) {
      filters.dateRange = {
        start: dateRange.start,
        end: dateRange.end,
      }
    }
    if (hasDetails !== undefined) filters.hasDetails = hasDetails

    onSearch(filters)
    setIsOpen(false)
  }

  const handleClear = () => {
    setSearchText("")
    setSelectedActions([])
    setSelectedResources([])
    setSelectedStatuses([])
    setSelectedUserIds([])
    setIpAddresses([])
    setDateRange({})
    setHasDetails(undefined)
    onClear()
  }

  const handleSaveSearch = () => {
    const filters: Record<string, unknown> = {}
    if (searchText) filters.searchText = searchText
    if (selectedActions.length > 0) filters.actions = selectedActions
    if (selectedResources.length > 0) filters.resources = selectedResources
    if (selectedStatuses.length > 0) filters.statuses = selectedStatuses
    if (selectedUserIds.length > 0) filters.userIds = selectedUserIds
    if (ipAddresses.length > 0) filters.ipAddresses = ipAddresses
    if (dateRange.start && dateRange.end) {
      filters.dateRange = { start: dateRange.start, end: dateRange.end }
    }
    if (hasDetails !== undefined) filters.hasDetails = hasDetails

    saveSearchMutation.mutate({
      searchQuery: searchText || "",
      filters,
    })
  }

  const toggleAction = (action: string) => {
    setSelectedActions((prev) =>
      prev.includes(action)
        ? prev.filter((a) => a !== action)
        : [...prev, action]
    )
  }

  const toggleResource = (resource: string) => {
    setSelectedResources((prev) =>
      prev.includes(resource)
        ? prev.filter((r) => r !== resource)
        : [...prev, resource]
    )
  }

  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status]
    )
  }

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((u) => u !== userId)
        : [...prev, userId]
    )
  }

  const addIpAddress = (ip: string) => {
    if (ip && !ipAddresses.includes(ip)) {
      setIpAddresses([...ipAddresses, ip])
    }
  }

  const removeIpAddress = (ip: string) => {
    setIpAddresses(ipAddresses.filter((i) => i !== ip))
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Filter className="mr-2 h-4 w-4" />
          {t("audit.advancedSearch.title")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("audit.advancedSearch.title")}</DialogTitle>
          <DialogDescription>
            {t("audit.advancedSearch.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Search Text */}
          <div className="space-y-2">
            <Label>{t("audit.advancedSearch.searchText")}</Label>
            <Input
              placeholder={t("audit.advancedSearch.searchTextPlaceholder")}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>

          {/* Actions */}
          {actionTypes && actionTypes.length > 0 && (
            <div className="space-y-2">
              <Label>{t("audit.advancedSearch.actions")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between"
                  >
                    {selectedActions.length > 0
                      ? selectedActions.length === 1
                        ? selectedActions[0]
                        : t("audit.advancedSearch.selectedActions", {
                            count: selectedActions.length,
                          })
                      : t("audit.advancedSearch.selectActions")}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder={t("audit.advancedSearch.searchActions")}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {t("audit.advancedSearch.noActionsFound")}
                      </CommandEmpty>
                      <CommandGroup>
                        {actionTypes.map((action) => (
                          <CommandItem
                            key={action}
                            value={action}
                            onSelect={() => toggleAction(action)}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedActions.includes(action)
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            {action}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedActions.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedActions.map((action) => (
                    <div
                      key={action}
                      className="flex items-center gap-1 px-2 py-1 bg-secondary rounded-md text-sm"
                    >
                      {action}
                      <button
                        onClick={() => toggleAction(action)}
                        className="ml-1"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Resources */}
          <div className="space-y-2">
            <Label>{t("audit.advancedSearch.resources")}</Label>
            <Input
              placeholder={t("audit.advancedSearch.resourcesPlaceholder")}
              value=""
              onChange={(e) => {
                const value = e.target.value
                if (value && value.includes(",")) {
                  const resources = value
                    .split(",")
                    .map((r) => r.trim())
                    .filter((r) => r && !selectedResources.includes(r))
                  setSelectedResources([...selectedResources, ...resources])
                  e.target.value = ""
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.currentTarget.value) {
                  const resource = e.currentTarget.value.trim()
                  if (resource && !selectedResources.includes(resource)) {
                    setSelectedResources([...selectedResources, resource])
                    e.currentTarget.value = ""
                  }
                }
              }}
            />
            {selectedResources.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedResources.map((resource) => (
                  <div
                    key={resource}
                    className="flex items-center gap-1 px-2 py-1 bg-secondary rounded-md text-sm"
                  >
                    {resource}
                    <button
                      onClick={() =>
                        setSelectedResources(
                          selectedResources.filter((r) => r !== resource)
                        )
                      }
                      className="ml-1"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Statuses */}
          <div className="space-y-2">
            <Label>{t("audit.advancedSearch.statuses")}</Label>
            <div className="flex flex-wrap gap-2">
              {["SUCCESS", "FAILED", "WARNING", "BLOCKED"].map((status) => (
                <div key={status} className="flex items-center space-x-2">
                  <Checkbox
                    id={`status-${status}`}
                    checked={selectedStatuses.includes(status)}
                    onCheckedChange={() => toggleStatus(status)}
                  />
                  <label
                    htmlFor={`status-${status}`}
                    className="text-sm cursor-pointer"
                  >
                    {t(`audit.${status.toLowerCase()}`)}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Users */}
          {users && users.length > 0 && (
            <div className="space-y-2">
              <Label>{t("audit.advancedSearch.users")}</Label>
              <div className="max-h-40 overflow-y-auto border rounded-md p-2">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center space-x-2 py-1">
                    <Checkbox
                      id={`user-${user.id}`}
                      checked={selectedUserIds.includes(user.id)}
                      onCheckedChange={() => toggleUser(user.id)}
                    />
                    <label
                      htmlFor={`user-${user.id}`}
                      className="text-sm cursor-pointer flex-1"
                    >
                      {user.name} ({user.email})
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* IP Addresses */}
          <div className="space-y-2">
            <Label>{t("audit.advancedSearch.ipAddresses")}</Label>
            <Input
              placeholder={t("audit.advancedSearch.ipAddressesPlaceholder")}
              value=""
              onChange={(e) => {
                const value = e.target.value
                if (value && value.includes(",")) {
                  const ips = value
                    .split(",")
                    .map((ip) => ip.trim())
                    .filter((ip) => ip && !ipAddresses.includes(ip))
                  setIpAddresses([...ipAddresses, ...ips])
                  e.target.value = ""
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.currentTarget.value) {
                  const ip = e.currentTarget.value.trim()
                  if (ip && !ipAddresses.includes(ip)) {
                    addIpAddress(ip)
                    e.currentTarget.value = ""
                  }
                }
              }}
            />
            {ipAddresses.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {ipAddresses.map((ip) => (
                  <div
                    key={ip}
                    className="flex items-center gap-1 px-2 py-1 bg-secondary rounded-md text-sm"
                  >
                    {ip}
                    <button onClick={() => removeIpAddress(ip)} className="ml-1">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Date Range */}
          <div className="space-y-2">
            <Label>{t("audit.advancedSearch.dateRange")}</Label>
            <div className="gap-2 grid grid-cols-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateRange.start && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.start ? (
                      format(dateRange.start, "PPP")
                    ) : (
                      <span>{t("audit.advancedSearch.startDate")}</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateRange.start}
                    onSelect={(date) =>
                      setDateRange({ ...dateRange, start: date })
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateRange.end && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.end ? (
                      format(dateRange.end, "PPP")
                    ) : (
                      <span>{t("audit.advancedSearch.endDate")}</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateRange.end}
                    onSelect={(date) =>
                      setDateRange({ ...dateRange, end: date })
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Has Details */}
          <div className="space-y-2">
            <Label>{t("audit.advancedSearch.hasDetails")}</Label>
            <Select
              value={
                hasDetails === undefined
                  ? "all"
                  : hasDetails
                    ? "yes"
                    : "no"
              }
              onValueChange={(value) => {
                if (value === "all") setHasDetails(undefined)
                else setHasDetails(value === "yes")
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("audit.advancedSearch.all")}
                </SelectItem>
                <SelectItem value="yes">{t("common.yes")}</SelectItem>
                <SelectItem value="no">{t("common.no")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClear}>
              {t("audit.advancedSearch.clear")}
            </Button>
            <Button
              variant="outline"
              onClick={handleSaveSearch}
              disabled={saveSearchMutation.isPending}
            >
              <Save className="mr-2 h-4 w-4" />
              {t("audit.advancedSearch.save")}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSearch}>
              <Search className="mr-2 h-4 w-4" />
              {t("audit.advancedSearch.search")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
