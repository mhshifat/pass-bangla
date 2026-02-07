"use client"

import * as React from "react"
import { useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { 
  RotateCw, 
  Plus, 
  Edit, 
  Trash2,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RotationPolicyDialog } from "@/modules/passwords/client/rotation-policy-dialog"
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
import { deleteRotationPolicyAction, autoRotatePasswordAction } from "@/app/admin/passwords/rotation-actions"
import { useTransition } from "react"
import { PasswordRotationPolicy } from "@/app/generated"
import { usePermissions } from "@/hooks/use-permissions"
import { showErrorFromException } from "@/lib/error-toast"

export function RotationPageClient() {
  const { t } = useTranslation()
  const { hasPermission } = usePermissions()
  const [isPending, startTransition] = useTransition()
  const [isPolicyDialogOpen, setIsPolicyDialogOpen] = useState(false)
  const [editingPolicy, setEditingPolicy] = useState<PasswordRotationPolicy | null>(null)
  const [deletingPolicyId, setDeletingPolicyId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("policies")
  const [rotatingPasswordId, setRotatingPasswordId] = useState<string | null>(null)
  const [showNewPasswordDialog, setShowNewPasswordDialog] = useState(false)
  const [newPassword, setNewPassword] = useState<string | null>(null)

  const utils = trpc.useUtils()
  const { data: policies, isLoading: policiesLoading } = trpc.passwordRotation.listPolicies.useQuery()
  const { data: reminders, isLoading: remindersLoading, refetch: refetchReminders } = trpc.passwordRotation.getReminders.useQuery({ daysAhead: 30 })
  const { data: history, isLoading: historyLoading } = trpc.passwordRotation.getRotationHistory.useQuery({ page: 1, pageSize: 20 })

  const handlePolicySuccess = useCallback(async () => {
    setIsPolicyDialogOpen(false)
    setEditingPolicy(null)
    // Invalidate queries instead of refetching to avoid infinite loops
    await utils.passwordRotation.listPolicies.invalidate()
    await utils.passwordRotation.getReminders.invalidate()
    await utils.passwordRotation.getRotationHistory.invalidate()
  }, [utils])

  const handleCreatePolicy = () => {
    setEditingPolicy(null)
    setIsPolicyDialogOpen(true)
  }

  const handleEditPolicy = (policy: PasswordRotationPolicy) => {
    setEditingPolicy(policy)
    setIsPolicyDialogOpen(true)
  }

  const handleDeletePolicy = (policyId: string) => {
    setDeletingPolicyId(policyId)
  }

  const confirmDelete = () => {
    if (!deletingPolicyId) return

    startTransition(async () => {
      try {
        const result = await deleteRotationPolicyAction(deletingPolicyId)
        if (result.success) {
          toast.success(t("passwords.rotation.policyDeleted"))
          setDeletingPolicyId(null)
          // Invalidate queries instead of refetching
          await utils.passwordRotation.listPolicies.invalidate()
          await utils.passwordRotation.getReminders.invalidate()
          await utils.passwordRotation.getRotationHistory.invalidate()
        } else {
          toast.error(result.error || t("passwords.rotation.policyDeleteError"))
        }
      } catch (error) { showErrorFromException(error, t("passwords.rotation.policyDeleteError")) }
    })
  }

  const handleAutoRotate = (passwordId: string) => {
    setRotatingPasswordId(passwordId)
  }

  const confirmAutoRotate = () => {
    if (!rotatingPasswordId) return

    startTransition(async () => {
      try {
        const result = await autoRotatePasswordAction(rotatingPasswordId)
        if (result.success) {
          toast.success(t("passwords.rotation.autoRotateSuccess"))
          setNewPassword(result.newPassword || null)
          setShowNewPasswordDialog(true)
          setRotatingPasswordId(null)
          // Invalidate and refetch queries to update reminders immediately
          await utils.passwordRotation.getReminders.invalidate()
          await refetchReminders()
          await utils.passwordRotation.getRotationHistory.invalidate()
          await utils.passwords.list.invalidate()
        } else {
          toast.error(result.error || t("passwords.rotation.autoRotateError"))
          setRotatingPasswordId(null)
        }
      } catch (error) {
        toast.error(t("passwords.rotation.autoRotateError"))
        setRotatingPasswordId(null)
      }
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-400">{t("passwords.rotation.completed")}</Badge>
      case "PENDING":
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400">{t("passwords.rotation.pending")}</Badge>
      case "FAILED":
        return <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-400">{t("passwords.rotation.failed")}</Badge>
      case "CANCELLED":
        return <Badge className="bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400">{t("passwords.rotation.cancelled")}</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <RotateCw className="h-8 w-8" />
              {t("passwords.rotation.title")}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t("passwords.rotation.description")}
            </p>
          </div>
          {hasPermission("password.edit") && (
            <Button onClick={handleCreatePolicy}>
              <Plus className="h-4 w-4 mr-2" />
              {t("passwords.rotation.createPolicy")}
            </Button>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className='flex items-center justify-start flex-wrap h-auto space-y-1'>
            <TabsTrigger value="policies">{t("passwords.rotation.policies")}</TabsTrigger>
            <TabsTrigger value="reminders">{t("passwords.rotation.reminders")}</TabsTrigger>
            <TabsTrigger value="history">{t("passwords.rotation.history")}</TabsTrigger>
          </TabsList>

          <TabsContent value="policies" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("passwords.rotation.policies")}</CardTitle>
                <CardDescription>
                  {t("passwords.rotation.policiesDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {policiesLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : !policies || policies.length === 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{t("passwords.rotation.noPolicies")}</AlertDescription>
                  </Alert>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("common.name")}</TableHead>
                          <TableHead>{t("passwords.rotation.rotationDays")}</TableHead>
                          <TableHead>{t("passwords.rotation.reminderDays")}</TableHead>
                          <TableHead>{t("passwords.rotation.autoRotate")}</TableHead>
                          <TableHead>{t("passwords.rotation.passwords")}</TableHead>
                          <TableHead>{t("common.status")}</TableHead>
                          <TableHead className="text-right">{t("common.actions")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {policies.map((policy) => (
                          <TableRow key={policy.id}>
                            <TableCell className="font-medium">{policy.name}</TableCell>
                            <TableCell>{policy.rotationDays} {t("passwords.rotation.days")}</TableCell>
                            <TableCell>{policy.reminderDays} {t("passwords.rotation.days")}</TableCell>
                            <TableCell>
                              {policy.autoRotate ? (
                                <Badge variant="outline" className="text-green-600">{t("common.yes")}</Badge>
                              ) : (
                                <Badge variant="outline" className="text-gray-600">{t("common.no")}</Badge>
                              )}
                            </TableCell>
                            <TableCell>{policy._count.passwords}</TableCell>
                            <TableCell>
                              {policy.isActive ? (
                                <Badge className="bg-green-100 text-green-800">{t("common.active")}</Badge>
                              ) : (
                                <Badge variant="outline">{t("common.inactive")}</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditPolicy(policy)}
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeletePolicy(policy.id)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reminders" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("passwords.rotation.reminders")}</CardTitle>
                <CardDescription>
                  {t("passwords.rotation.remindersDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {remindersLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : !reminders || reminders.length === 0 ? (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription>{t("passwords.rotation.noReminders")}</AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-4">
                    {reminders.map((reminder) => (
                      <Card key={reminder.passwordId}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="space-y-1">
                              <div className="font-medium">{reminder.passwordName}</div>
                              <div className="text-sm text-muted-foreground">{reminder.passwordUsername}</div>
                              <div className="flex items-center gap-4 text-sm">
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  <span>{t("passwords.rotation.nextRotation")}: {new Date(reminder.nextRotationDate).toLocaleDateString()}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  <span>{reminder.daysUntilRotation} {t("passwords.rotation.daysUntil")}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-yellow-600">
                                {reminder.policyName}
                              </Badge>
                              <Button
                                size="sm"
                                onClick={() => handleAutoRotate(reminder.passwordId)}
                                disabled={isPending && rotatingPasswordId === reminder.passwordId}
                              >
                                <RotateCw className={`h-3 w-3 mr-2 ${isPending && rotatingPasswordId === reminder.passwordId ? "animate-spin" : ""}`} />
                                {t("passwords.rotation.rotateNow")}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("passwords.rotation.history")}</CardTitle>
                <CardDescription>
                  {t("passwords.rotation.historyDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {historyLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : !history?.rotations || history.rotations.length === 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{t("passwords.rotation.noHistory")}</AlertDescription>
                  </Alert>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("common.name")}</TableHead>
                          <TableHead>{t("passwords.rotation.type")}</TableHead>
                          <TableHead>{t("passwords.rotation.scheduledFor")}</TableHead>
                          <TableHead>{t("passwords.rotation.completedAt")}</TableHead>
                          <TableHead>{t("passwords.rotation.rotatedBy")}</TableHead>
                          <TableHead>{t("common.status")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.rotations.map((rotation) => (
                          <TableRow key={rotation.id}>
                            <TableCell className="font-medium">{rotation.password.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{t(`passwords.rotation.${rotation.rotationType.toLowerCase()}`)}</Badge>
                            </TableCell>
                            <TableCell>
                              {rotation.scheduledFor ? new Date(rotation.scheduledFor).toLocaleString() : "-"}
                            </TableCell>
                            <TableCell>
                              {rotation.completedAt ? new Date(rotation.completedAt).toLocaleString() : "-"}
                            </TableCell>
                            <TableCell>{rotation.rotatedByUser?.name || "-"}</TableCell>
                            <TableCell>{getStatusBadge(rotation.status)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <RotationPolicyDialog
        open={isPolicyDialogOpen}
        onOpenChange={setIsPolicyDialogOpen}
        policy={editingPolicy}
        onSuccess={handlePolicySuccess}
      />

      <AlertDialog open={deletingPolicyId !== null} onOpenChange={(open) => !open && setDeletingPolicyId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("passwords.rotation.deletePolicyTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("passwords.rotation.deletePolicyDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingPolicyId(null)}>
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

      <AlertDialog open={rotatingPasswordId !== null} onOpenChange={(open) => !open && setRotatingPasswordId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("passwords.rotation.autoRotateTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("passwords.rotation.autoRotateDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRotatingPasswordId(null)}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAutoRotate}
              disabled={isPending}
            >
              {isPending ? t("common.loading") : t("passwords.rotation.confirmRotate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showNewPasswordDialog} onOpenChange={setShowNewPasswordDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("passwords.rotation.newPasswordTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("passwords.rotation.newPasswordDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4">
            <div className="bg-muted p-4 rounded-md font-mono text-sm break-all">
              {newPassword}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {t("passwords.rotation.copyPasswordHint")}
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={async () => {
                if (newPassword) {
                  await navigator.clipboard.writeText(newPassword)
                  toast.success(t("passwords.passwordCopied"))
                }
                setShowNewPasswordDialog(false)
                setNewPassword(null)
              }}
            >
              {t("passwords.copyPassword")}
            </AlertDialogAction>
            <AlertDialogCancel onClick={() => {
              setShowNewPasswordDialog(false)
              setNewPassword(null)
            }}>
              {t("common.close")}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

