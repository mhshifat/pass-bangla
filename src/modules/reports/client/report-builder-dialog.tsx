"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import z from "zod"
import { trpc } from "@/trpc/client"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { CalendarIcon, ChevronDown, ChevronUp } from "lucide-react"
import { format } from "date-fns"
import { toast } from "sonner"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { showErrorFromException } from "@/lib/error-toast"

const reportSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  reportType: z.enum(["CUSTOM", "SOC2", "ISO27001", "AUDIT", "SECURITY", "COMPLIANCE"]),
  format: z.enum(["PDF", "CSV", "Excel", "JSON"]),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  // Advanced options for CUSTOM reports
  fields: z.array(z.string()).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  userIds: z.array(z.string()).optional(),
  actions: z.array(z.string()).optional(),
  resources: z.array(z.string()).optional(),
  statuses: z.array(z.enum(["SUCCESS", "FAILED", "WARNING", "BLOCKED"])).optional(),
  limit: z.number().min(1).max(50000).optional(),
})

type ReportFormValues = z.infer<typeof reportSchema>

interface ReportBuilderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId?: string
}

export function ReportBuilderDialog({
  open,
  onOpenChange,
  templateId,
}: ReportBuilderDialogProps) {
  const { t } = useTranslation()
  const utils = trpc.useUtils()
  const [showAdvanced, setShowAdvanced] = React.useState(false)

  const form = useForm<ReportFormValues>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      name: "",
      description: "",
      reportType: "CUSTOM",
      format: "PDF",
      fields: [],
      sortBy: "timestamp",
      sortOrder: "desc",
      userIds: [],
      actions: [],
      resources: [],
      statuses: [],
      limit: 10000,
    },
  })

  const reportType = form.watch("reportType")
  const isCustomReport = reportType === "CUSTOM"

  // Available fields for custom reports
  const availableFields = [
    { value: "id", label: "ID" },
    { value: "timestamp", label: "Timestamp" },
    { value: "user", label: "User" },
    { value: "userEmail", label: "User Email" },
    { value: "action", label: "Action" },
    { value: "resource", label: "Resource" },
    { value: "resourceId", label: "Resource ID" },
    { value: "status", label: "Status" },
    { value: "ipAddress", label: "IP Address" },
    { value: "userAgent", label: "User Agent" },
    { value: "details", label: "Details" },
  ]

  // Sort options
  const sortOptions = [
    { value: "timestamp", label: "Timestamp" },
    { value: "user", label: "User" },
    { value: "action", label: "Action" },
    { value: "resource", label: "Resource" },
    { value: "status", label: "Status" },
  ]

  // Status options
  const statusOptions = [
    { value: "SUCCESS" as const, label: "Success" },
    { value: "FAILED" as const, label: "Failed" },
    { value: "WARNING" as const, label: "Warning" },
    { value: "BLOCKED" as const, label: "Blocked" },
  ]

  // Fetch users for filtering
  const { data: usersData } = trpc.users.list.useQuery(
    { page: 1, pageSize: 100 },
    { enabled: isCustomReport && showAdvanced }
  )
  const users = usersData?.users || []

  // Common actions and resources (can be expanded)
  const commonActions = [
    "LOGIN_SUCCESS",
    "LOGIN_FAILED",
    "LOGOUT",
    "PASSWORD_CREATED",
    "PASSWORD_UPDATED",
    "PASSWORD_DELETED",
    "REPORT_GENERATED",
    "REPORT_DOWNLOADED",
    "REPORT_DELETED",
    "USER_CREATED",
    "USER_UPDATED",
    "USER_DELETED",
  ]

  const commonResources = [
    "User",
    "Password",
    "Report",
    "Team",
    "Role",
    "Session",
    "Settings",
  ]

  const generateMutation = trpc.reports.generate.useMutation({
    onSuccess: async (data) => {
      toast.success(t("reports.generateSuccess"))
      
      // Download the file
      if (data.content) {
        const blob = new Blob(
          [Uint8Array.from(atob(data.content), (c) => c.charCodeAt(0))],
          { type: data.mimeType }
        )
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `${data.report.name}.${data.fileExtension}`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }

      utils.reports.list.invalidate()
      onOpenChange(false)
      form.reset()
    },
    onError: (error) => {
      showErrorFromException(error, t("reports.generateError"))
    },
  })

  const onSubmit = (values: ReportFormValues) => {
    const config: Record<string, unknown> = {
      name: values.name, // Include name in config for report generation
    }
    
    // Date range filter
    if (values.startDate || values.endDate) {
      config.filters = {
        dateRange: {
          start: values.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: values.endDate || new Date(),
        },
      }
    }

    // Additional filters for CUSTOM reports
    if (isCustomReport) {
      const filters: Record<string, unknown> = config.filters || {}
      
      if (values.userIds && values.userIds.length > 0) {
        filters.userIds = values.userIds
      }
      if (values.actions && values.actions.length > 0) {
        filters.actions = values.actions
      }
      if (values.resources && values.resources.length > 0) {
        filters.resources = values.resources
      }
      if (values.statuses && values.statuses.length > 0) {
        filters.statuses = values.statuses
      }
      
      if (Object.keys(filters).length > 0) {
        config.filters = filters
      }

      // Field selection
      if (values.fields && values.fields.length > 0) {
        config.fields = values.fields
      }

      // Sorting
      if (values.sortBy) {
        config.sortBy = values.sortBy
        config.sortOrder = values.sortOrder || "desc"
      }

      // Limit
      if (values.limit) {
        config.limit = values.limit
      }
    }

    generateMutation.mutate({
      name: values.name,
      description: values.description,
      reportType: values.reportType,
      format: values.format,
      config,
      templateId,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("reports.builder.title")}</DialogTitle>
          <DialogDescription>{t("reports.builder.description")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("reports.builder.name")}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={t("reports.builder.namePlaceholder")} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("reports.builder.description")}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={t("reports.builder.descriptionPlaceholder")} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="reportType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("reports.builder.reportType")}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="CUSTOM">{t("reports.types.CUSTOM")}</SelectItem>
                        <SelectItem value="AUDIT">{t("reports.types.AUDIT")}</SelectItem>
                        <SelectItem value="SECURITY">{t("reports.types.SECURITY")}</SelectItem>
                        <SelectItem value="COMPLIANCE">{t("reports.types.COMPLIANCE")}</SelectItem>
                        <SelectItem value="SOC2">{t("reports.types.SOC2")}</SelectItem>
                        <SelectItem value="ISO27001">{t("reports.types.ISO27001")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="format"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("reports.builder.format")}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="PDF">PDF</SelectItem>
                        <SelectItem value="CSV">CSV</SelectItem>
                        <SelectItem value="Excel">Excel</SelectItem>
                        <SelectItem value="JSON">JSON</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("reports.builder.startDate")}</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className="w-full justify-start text-left font-normal"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, "PPP") : t("reports.builder.selectDate")}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("reports.builder.endDate")}</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className="w-full justify-start text-left font-normal"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, "PPP") : t("reports.builder.selectDate")}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Advanced Options for CUSTOM reports */}
            {isCustomReport && (
              <>
                <Separator />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full justify-between"
                >
                  <span>{t("reports.builder.advancedOptions", { defaultValue: "Advanced Options" })}</span>
                  {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>

                {showAdvanced && (
                  <div className="space-y-4 pt-2">
                    {/* Field Selection */}
                    <FormField
                      control={form.control}
                      name="fields"
                      render={() => (
                        <FormItem>
                          <FormLabel>{t("reports.builder.selectFields", { defaultValue: "Select Fields" })}</FormLabel>
                          <div className="grid grid-cols-2 gap-3 mt-2">
                            {availableFields.map((field) => (
                              <FormField
                                key={field.value}
                                control={form.control}
                                name="fields"
                                render={({ field: formField }) => {
                                  return (
                                    <FormItem
                                      key={field.value}
                                      className="flex flex-row items-start space-x-3 space-y-0"
                                    >
                                      <FormControl>
                                        <Checkbox
                                          checked={formField.value?.includes(field.value)}
                                          onCheckedChange={(checked) => {
                                            const current = formField.value || []
                                            return formField.onChange(
                                              checked
                                                ? [...current, field.value]
                                                : current.filter((v) => v !== field.value)
                                            )
                                          }}
                                        />
                                      </FormControl>
                                      <FormLabel className="font-normal cursor-pointer">
                                        {field.label}
                                      </FormLabel>
                                    </FormItem>
                                  )
                                }}
                              />
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Sorting */}
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="sortBy"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("reports.builder.sortBy", { defaultValue: "Sort By" })}</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {sortOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="sortOrder"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("reports.builder.sortOrder", { defaultValue: "Order" })}</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="desc">{t("reports.builder.descending", { defaultValue: "Descending" })}</SelectItem>
                                <SelectItem value="asc">{t("reports.builder.ascending", { defaultValue: "Ascending" })}</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Filters */}
                    <div className="space-y-4">
                      <FormLabel>{t("reports.builder.filters", { defaultValue: "Filters" })}</FormLabel>

                      {/* User Filter */}
                      <FormField
                        control={form.control}
                        name="userIds"
                        render={() => (
                          <FormItem>
                            <FormLabel className="text-sm">{t("reports.builder.filterByUsers", { defaultValue: "Filter by Users" })}</FormLabel>
                            <div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-2">
                              {users.length === 0 ? (
                                <p className="text-sm text-muted-foreground">{t("reports.builder.loadingUsers", { defaultValue: "Loading users..." })}</p>
                              ) : (
                                users.map((user) => (
                                  <FormField
                                    key={user.id}
                                    control={form.control}
                                    name="userIds"
                                    render={({ field: formField }) => {
                                      return (
                                        <FormItem
                                          key={user.id}
                                          className="flex flex-row items-start space-x-3 space-y-0"
                                        >
                                          <FormControl>
                                            <Checkbox
                                              checked={formField.value?.includes(user.id)}
                                              onCheckedChange={(checked) => {
                                                const current = formField.value || []
                                                return formField.onChange(
                                                  checked
                                                    ? [...current, user.id]
                                                    : current.filter((v) => v !== user.id)
                                                )
                                              }}
                                            />
                                          </FormControl>
                                          <FormLabel className="font-normal cursor-pointer text-sm">
                                            {user.name} ({user.email})
                                          </FormLabel>
                                        </FormItem>
                                      )
                                    }}
                                  />
                                ))
                              )}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Actions Filter */}
                      <FormField
                        control={form.control}
                        name="actions"
                        render={() => (
                          <FormItem>
                            <FormLabel className="text-sm">{t("reports.builder.filterByActions", { defaultValue: "Filter by Actions" })}</FormLabel>
                            <div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-2">
                              {commonActions.map((action) => (
                                <FormField
                                  key={action}
                                  control={form.control}
                                  name="actions"
                                  render={({ field: formField }) => {
                                    return (
                                      <FormItem
                                        key={action}
                                        className="flex flex-row items-start space-x-3 space-y-0"
                                      >
                                        <FormControl>
                                          <Checkbox
                                            checked={formField.value?.includes(action)}
                                            onCheckedChange={(checked) => {
                                              const current = formField.value || []
                                              return formField.onChange(
                                                checked
                                                  ? [...current, action]
                                                  : current.filter((v) => v !== action)
                                              )
                                            }}
                                          />
                                        </FormControl>
                                        <FormLabel className="font-normal cursor-pointer text-sm">
                                          {action.replace(/_/g, " ")}
                                        </FormLabel>
                                      </FormItem>
                                    )
                                  }}
                                />
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Resources Filter */}
                      <FormField
                        control={form.control}
                        name="resources"
                        render={() => (
                          <FormItem>
                            <FormLabel className="text-sm">{t("reports.builder.filterByResources", { defaultValue: "Filter by Resources" })}</FormLabel>
                            <div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-2">
                              {commonResources.map((resource) => (
                                <FormField
                                  key={resource}
                                  control={form.control}
                                  name="resources"
                                  render={({ field: formField }) => {
                                    return (
                                      <FormItem
                                        key={resource}
                                        className="flex flex-row items-start space-x-3 space-y-0"
                                      >
                                        <FormControl>
                                          <Checkbox
                                            checked={formField.value?.includes(resource)}
                                            onCheckedChange={(checked) => {
                                              const current = formField.value || []
                                              return formField.onChange(
                                                checked
                                                  ? [...current, resource]
                                                  : current.filter((v) => v !== resource)
                                              )
                                            }}
                                          />
                                        </FormControl>
                                        <FormLabel className="font-normal cursor-pointer text-sm">
                                          {resource}
                                        </FormLabel>
                                      </FormItem>
                                    )
                                  }}
                                />
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Status Filter */}
                      <FormField
                        control={form.control}
                        name="statuses"
                        render={() => (
                          <FormItem>
                            <FormLabel className="text-sm">{t("reports.builder.filterByStatus", { defaultValue: "Filter by Status" })}</FormLabel>
                            <div className="grid grid-cols-2 gap-2">
                              {statusOptions.map((status) => (
                                <FormField
                                  key={status.value}
                                  control={form.control}
                                  name="statuses"
                                  render={({ field: formField }) => {
                                    return (
                                      <FormItem
                                        key={status.value}
                                        className="flex flex-row items-start space-x-3 space-y-0"
                                      >
                                        <FormControl>
                                          <Checkbox
                                            checked={formField.value?.includes(status.value)}
                                            onCheckedChange={(checked) => {
                                              const current = formField.value || []
                                              return formField.onChange(
                                                checked
                                                  ? [...current, status.value]
                                                  : current.filter((v) => v !== status.value)
                                              )
                                            }}
                                          />
                                        </FormControl>
                                        <FormLabel className="font-normal cursor-pointer text-sm">
                                          {status.label}
                                        </FormLabel>
                                      </FormItem>
                                    )
                                  }}
                                />
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Limit */}
                    <FormField
                      control={form.control}
                      name="limit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("reports.builder.recordLimit", { defaultValue: "Record Limit" })}</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={50000}
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : 10000)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={generateMutation.isPending}>
                {generateMutation.isPending
                  ? t("reports.generating")
                  : t("reports.generate")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}




