"use client"

import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import z from "zod"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { Loader2, Download, Trash2, FileText, AlertCircle } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { usePermissions } from "@/hooks/use-permissions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useState } from "react"
import { showErrorFromException } from "@/lib/error-toast"

const dataRetentionPolicySchema = z.object({
  auditLogRetentionDays: z.number().min(0).max(3650).nullable(),
  passwordHistoryRetentionDays: z.number().min(0).max(3650).nullable(),
  sessionRetentionDays: z.number().min(0).max(3650).nullable(),
  deletedDataRetentionDays: z.number().min(0).max(3650).nullable(),
  autoDeleteEnabled: z.boolean(),
  isActive: z.boolean(),
})

type DataRetentionPolicyForm = z.infer<typeof dataRetentionPolicySchema>

export function ComplianceSettings() {
  const { t } = useTranslation()
  const { hasPermission } = usePermissions()
  const canEdit = hasPermission("settings.edit")
  const canView = hasPermission("settings.view")
  const utils = trpc.useUtils()

  const { data: retentionPolicy, isLoading: loadingPolicy } =
    trpc.settings.getDataRetentionPolicy.useQuery(undefined, {
      enabled: canView,
    })

  const { data: complianceReport, isLoading: loadingReport } =
    trpc.settings.getComplianceReport.useQuery(undefined, {
      enabled: canView,
    })

  const updatePolicyMutation = trpc.settings.updateDataRetentionPolicy.useMutation({
    onSuccess: () => {
      toast.success(t("settings.compliance.dataRetentionPolicy.saved"))
      // Refetch data
      utils.settings.getDataRetentionPolicy.invalidate()
      utils.settings.getComplianceReport.invalidate()
    },
    onError: (error) => {
      showErrorFromException(
        error,
        t("settings.compliance.dataRetentionPolicy.saveFailed", {
          error: error.message,
        })
      )
    },
  })

  const exportDataMutation = trpc.settings.requestDataExport.useMutation({
    onSuccess: (data) => {
      // Download JSON file
      const blob = new Blob([JSON.stringify(data.data, null, 2)], {
        type: "application/json",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `data-export-${new Date().toISOString()}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success(t("settings.compliance.dataExport.success"))
      utils.settings.getComplianceReport.invalidate()
    },
    onError: (error) => {
      showErrorFromException(
        error,
        t("settings.compliance.dataExport.failed", {
          error: error.message,
        })
      )
    },
  })

  const deleteDataMutation = trpc.settings.requestDataDeletion.useMutation({
    onSuccess: (data) => {
      toast.success(t("settings.compliance.dataDeletion.requested"))
      // Show confirmation dialog
      setShowConfirmDialog(true)
      setConfirmationToken(data.confirmationToken)
      utils.settings.getComplianceReport.invalidate()
    },
    onError: (error) => {
      showErrorFromException(
        error,
        t("settings.compliance.dataDeletion.requestFailed", {
          error: error.message,
        })
      )
    },
  })

  const confirmDeletionMutation = trpc.settings.confirmDataDeletion.useMutation({
    onSuccess: () => {
      toast.success(t("settings.compliance.dataDeletion.completed"))
      setShowConfirmDialog(false)
      setConfirmationToken("")
      utils.settings.getComplianceReport.invalidate()
    },
    onError: (error) => {
      showErrorFromException(
        error,
        t("settings.compliance.dataDeletion.confirmFailed", {
          error: error.message,
        })
      )
    },
  })

  const cleanupMutation = trpc.settings.runDataCleanup.useMutation({
    onSuccess: (data) => {
      toast.success(
        t("settings.compliance.cleanup.success", {
          cleaned: data.cleaned.join(", "),
        })
      )
      utils.settings.getComplianceReport.invalidate()
    },
    onError: (error) => {
      showErrorFromException(
        error,
        t("settings.compliance.cleanup.failed", {
          error: error.message,
        })
      )
    },
  })

  const form = useForm<DataRetentionPolicyForm>({
    resolver: zodResolver(dataRetentionPolicySchema),
    defaultValues: {
      auditLogRetentionDays: null,
      passwordHistoryRetentionDays: 365,
      sessionRetentionDays: 90,
      deletedDataRetentionDays: 30,
      autoDeleteEnabled: false,
      isActive: true,
    },
  })

  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [confirmationToken, setConfirmationToken] = useState("")
  const [exportType, setExportType] = useState<
    "FULL" | "PASSWORDS" | "AUDIT_LOGS" | "PROFILE"
  >("FULL")

  useEffect(() => {
    if (retentionPolicy) {
      form.reset({
        auditLogRetentionDays: retentionPolicy.auditLogRetentionDays,
        passwordHistoryRetentionDays: retentionPolicy.passwordHistoryRetentionDays,
        sessionRetentionDays: retentionPolicy.sessionRetentionDays,
        deletedDataRetentionDays: retentionPolicy.deletedDataRetentionDays,
        autoDeleteEnabled: retentionPolicy.autoDeleteEnabled,
        isActive: retentionPolicy.isActive,
      })
    }
  }, [retentionPolicy, form])

  if (!canView) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {t("settings.compliance.noPermission")}
        </AlertDescription>
      </Alert>
    )
  }

  const onSubmit = (data: DataRetentionPolicyForm) => {
    if (!canEdit) {
      toast.error(t("settings.compliance.noEditPermission"))
      return
    }
    updatePolicyMutation.mutate(data)
  }

  const handleExport = (type: typeof exportType) => {
    exportDataMutation.mutate({ exportType: type })
  }

  const handleRequestDeletion = () => {
    deleteDataMutation.mutate({
      deletionScope: {
        deletePasswords: true,
        deleteAuditLogs: true,
        deleteSessions: true,
        deleteProfile: false, // Don't delete profile by default
      },
    })
  }

  const handleConfirmDeletion = () => {
    if (!confirmationToken) {
      toast.error(t("settings.compliance.dataDeletion.noToken"))
      return
    }
    confirmDeletionMutation.mutate({ confirmationToken })
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="retention" className="w-full">
        <TabsList className='flex items-center justify-start flex-wrap h-auto space-y-1'>
          <TabsTrigger value="retention">
            {t("settings.compliance.dataRetentionPolicy.title")}
          </TabsTrigger>
          <TabsTrigger value="export">
            {t("settings.compliance.dataExport.title")}
          </TabsTrigger>
          <TabsTrigger value="deletion">
            {t("settings.compliance.dataDeletion.title")}
          </TabsTrigger>
          <TabsTrigger value="report">
            {t("settings.compliance.report.title")}
          </TabsTrigger>
        </TabsList>

        {/* Data Retention Policy */}
        <TabsContent value="retention">
          <Card>
            <CardHeader>
              <CardTitle>
                {t("settings.compliance.dataRetentionPolicy.title")}
              </CardTitle>
              <CardDescription>
                {t("settings.compliance.dataRetentionPolicy.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingPolicy ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-6"
                  >
                    <FormField
                      control={form.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">
                              {t(
                                "settings.compliance.dataRetentionPolicy.isActive"
                              )}
                            </FormLabel>
                            <FormDescription>
                              {t(
                                "settings.compliance.dataRetentionPolicy.isActiveDescription"
                              )}
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={!canEdit}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <Separator />

                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="auditLogRetentionDays"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t(
                                "settings.compliance.dataRetentionPolicy.auditLogRetentionDays"
                              )}
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                max="3650"
                                placeholder={t(
                                  "settings.compliance.dataRetentionPolicy.forever"
                                )}
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) =>
                                  field.onChange(
                                    e.target.value === ""
                                      ? null
                                      : parseInt(e.target.value, 10)
                                  )
                                }
                                disabled={!canEdit}
                              />
                            </FormControl>
                            <FormDescription>
                              {t(
                                "settings.compliance.dataRetentionPolicy.auditLogRetentionDaysDescription"
                              )}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="passwordHistoryRetentionDays"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t(
                                "settings.compliance.dataRetentionPolicy.passwordHistoryRetentionDays"
                              )}
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                max="3650"
                                placeholder="365"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) =>
                                  field.onChange(
                                    e.target.value === ""
                                      ? null
                                      : parseInt(e.target.value, 10)
                                  )
                                }
                                disabled={!canEdit}
                              />
                            </FormControl>
                            <FormDescription>
                              {t(
                                "settings.compliance.dataRetentionPolicy.passwordHistoryRetentionDaysDescription"
                              )}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="sessionRetentionDays"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t(
                                "settings.compliance.dataRetentionPolicy.sessionRetentionDays"
                              )}
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                max="3650"
                                placeholder="90"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) =>
                                  field.onChange(
                                    e.target.value === ""
                                      ? null
                                      : parseInt(e.target.value, 10)
                                  )
                                }
                                disabled={!canEdit}
                              />
                            </FormControl>
                            <FormDescription>
                              {t(
                                "settings.compliance.dataRetentionPolicy.sessionRetentionDaysDescription"
                              )}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="deletedDataRetentionDays"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t(
                                "settings.compliance.dataRetentionPolicy.deletedDataRetentionDays"
                              )}
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                max="3650"
                                placeholder="30"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) =>
                                  field.onChange(
                                    e.target.value === ""
                                      ? null
                                      : parseInt(e.target.value, 10)
                                  )
                                }
                                disabled={!canEdit}
                              />
                            </FormControl>
                            <FormDescription>
                              {t(
                                "settings.compliance.dataRetentionPolicy.deletedDataRetentionDaysDescription"
                              )}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="autoDeleteEnabled"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                              <FormLabel className="text-base">
                                {t(
                                  "settings.compliance.dataRetentionPolicy.autoDeleteEnabled"
                                )}
                              </FormLabel>
                              <FormDescription>
                                {t(
                                  "settings.compliance.dataRetentionPolicy.autoDeleteEnabledDescription"
                                )}
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={!canEdit}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    {canEdit && (
                      <Button
                        type="submit"
                        disabled={updatePolicyMutation.isPending}
                      >
                        {updatePolicyMutation.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        {t("settings.compliance.dataRetentionPolicy.saveButton")}
                      </Button>
                    )}

                    {canEdit && form.watch("autoDeleteEnabled") && (
                      <div className="mt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => cleanupMutation.mutate()}
                          disabled={cleanupMutation.isPending}
                        >
                          {cleanupMutation.isPending && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          {t("settings.compliance.cleanup.runButton")}
                        </Button>
                      </div>
                    )}
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Data Export */}
        <TabsContent value="export">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.compliance.dataExport.title")}</CardTitle>
              <CardDescription>
                {t("settings.compliance.dataExport.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t("settings.compliance.dataExport.exportType")}
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <Button
                    type="button"
                    variant={exportType === "FULL" ? "default" : "outline"}
                    onClick={() => setExportType("FULL")}
                    className="h-auto flex-col items-start p-4"
                  >
                    <FileText className="mb-2 h-5 w-5" />
                    <span className="font-semibold">
                      {t("settings.compliance.dataExport.types.FULL")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("settings.compliance.dataExport.types.FULLDescription")}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant={exportType === "PASSWORDS" ? "default" : "outline"}
                    onClick={() => setExportType("PASSWORDS")}
                    className="h-auto flex-col items-start p-4"
                  >
                    <Download className="mb-2 h-5 w-5" />
                    <span className="font-semibold">
                      {t("settings.compliance.dataExport.types.PASSWORDS")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t(
                        "settings.compliance.dataExport.types.PASSWORDSDescription"
                      )}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant={
                      exportType === "AUDIT_LOGS" ? "default" : "outline"
                    }
                    onClick={() => setExportType("AUDIT_LOGS")}
                    className="h-auto flex-col items-start p-4"
                  >
                    <FileText className="mb-2 h-5 w-5" />
                    <span className="font-semibold">
                      {t("settings.compliance.dataExport.types.AUDIT_LOGS")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t(
                        "settings.compliance.dataExport.types.AUDIT_LOGSDescription"
                      )}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant={exportType === "PROFILE" ? "default" : "outline"}
                    onClick={() => setExportType("PROFILE")}
                    className="h-auto flex-col items-start p-4"
                  >
                    <FileText className="mb-2 h-5 w-5" />
                    <span className="font-semibold">
                      {t("settings.compliance.dataExport.types.PROFILE")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t(
                        "settings.compliance.dataExport.types.PROFILEDescription"
                      )}
                    </span>
                  </Button>
                </div>
              </div>

              <Button
                onClick={() => handleExport(exportType)}
                disabled={exportDataMutation.isPending}
                className="w-full"
              >
                {exportDataMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                <Download className="mr-2 h-4 w-4" />
                {t("settings.compliance.dataExport.exportButton")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Data Deletion */}
        <TabsContent value="deletion">
          <Card>
            <CardHeader>
              <CardTitle>
                {t("settings.compliance.dataDeletion.title")}
              </CardTitle>
              <CardDescription>
                {t("settings.compliance.dataDeletion.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t("settings.compliance.dataDeletion.warning")}
                </AlertDescription>
              </Alert>

              <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t("settings.compliance.dataDeletion.confirmTitle")}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("settings.compliance.dataDeletion.confirmDescription")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>
                      {t("settings.compliance.dataDeletion.cancel")}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleConfirmDeletion}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {t("settings.compliance.dataDeletion.confirm")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    disabled={deleteDataMutation.isPending}
                    className="w-full"
                  >
                    {deleteDataMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("settings.compliance.dataDeletion.requestButton")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t("settings.compliance.dataDeletion.requestTitle")}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("settings.compliance.dataDeletion.requestDescription")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>
                      {t("settings.compliance.dataDeletion.cancel")}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleRequestDeletion}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {t("settings.compliance.dataDeletion.requestConfirm")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Compliance Report */}
        <TabsContent value="report">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.compliance.report.title")}</CardTitle>
              <CardDescription>
                {t("settings.compliance.report.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingReport ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <div className="space-y-4">
                  {complianceReport?.statistics && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-lg border p-4">
                        <div className="text-sm text-muted-foreground">
                          {t("settings.compliance.report.totalUsers")}
                        </div>
                        <div className="text-2xl font-bold">
                          {complianceReport.statistics.totalUsers}
                        </div>
                      </div>
                      <div className="rounded-lg border p-4">
                        <div className="text-sm text-muted-foreground">
                          {t("settings.compliance.report.totalPasswords")}
                        </div>
                        <div className="text-2xl font-bold">
                          {complianceReport.statistics.totalPasswords}
                        </div>
                      </div>
                      <div className="rounded-lg border p-4">
                        <div className="text-sm text-muted-foreground">
                          {t("settings.compliance.report.totalAuditLogs")}
                        </div>
                        <div className="text-2xl font-bold">
                          {complianceReport.statistics.totalAuditLogs}
                        </div>
                      </div>
                      <div className="rounded-lg border p-4">
                        <div className="text-sm text-muted-foreground">
                          {t("settings.compliance.report.pendingDeletionRequests")}
                        </div>
                        <div className="text-2xl font-bold">
                          {complianceReport.statistics.pendingDeletionRequests}
                        </div>
                      </div>
                      <div className="rounded-lg border p-4">
                        <div className="text-sm text-muted-foreground">
                          {t("settings.compliance.report.completedExports")}
                        </div>
                        <div className="text-2xl font-bold">
                          {complianceReport.statistics.completedExports}
                        </div>
                      </div>
                    </div>
                  )}

                  {complianceReport?.retentionPolicy && (
                    <div className="mt-4 rounded-lg border p-4">
                      <h3 className="mb-2 font-semibold">
                        {t("settings.compliance.report.retentionPolicy")}
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>
                            {t(
                              "settings.compliance.dataRetentionPolicy.auditLogRetentionDays"
                            )}
                          </span>
                          <span className="font-medium">
                            {complianceReport.retentionPolicy.auditLogRetentionDays ??
                              t("settings.compliance.dataRetentionPolicy.forever")}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>
                            {t(
                              "settings.compliance.dataRetentionPolicy.passwordHistoryRetentionDays"
                            )}
                          </span>
                          <span className="font-medium">
                            {complianceReport.retentionPolicy.passwordHistoryRetentionDays ??
                              t("settings.compliance.dataRetentionPolicy.forever")}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>
                            {t(
                              "settings.compliance.dataRetentionPolicy.sessionRetentionDays"
                            )}
                          </span>
                          <span className="font-medium">
                            {complianceReport.retentionPolicy.sessionRetentionDays ??
                              t("settings.compliance.dataRetentionPolicy.forever")}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>
                            {t(
                              "settings.compliance.dataRetentionPolicy.autoDeleteEnabled"
                            )}
                          </span>
                          <span className="font-medium">
                            {complianceReport.retentionPolicy.autoDeleteEnabled
                              ? t("common.yes")
                              : t("common.no")}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}


