"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { Loader2, Plus, Trash2, Edit, Shield, Globe, AlertTriangle, CheckCircle2 } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { showErrorFromException } from "@/lib/error-toast"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form"

const ipWhitelistSchema = z.object({
  ipAddress: z.string().min(1, "IP address is required"),
  description: z.string().optional(),
})

type IpWhitelistFormValues = z.infer<typeof ipWhitelistSchema>

export function IpWhitelistManagement() {
  const { t } = useTranslation()
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  const { data: whitelistsData, refetch } = trpc.settings.getIpWhitelists.useQuery()
  const { data: ipSettings, refetch: refetchSettings } = trpc.settings.getIpSecuritySettings.useQuery()

  const addMutation = trpc.settings.addIpWhitelist.useMutation({
    onSuccess: () => {
      toast.success(t("settings.security.ipWhitelist.added"))
      setIsAddDialogOpen(false)
      form.reset()
      refetch()
    },
    onError: (error) => {
      showErrorFromException(error, t("settings.security.ipWhitelist.addFailed"))
    },
  })

  const updateMutation = trpc.settings.updateIpWhitelist.useMutation({
    onSuccess: () => {
      toast.success(t("settings.security.ipWhitelist.updated"))
      setEditingId(null)
      refetch()
    },
    onError: (error) => {
      showErrorFromException(error, t("settings.security.ipWhitelist.updateFailed"))
    },
  })

  const deleteMutation = trpc.settings.deleteIpWhitelist.useMutation({
    onSuccess: () => {
      toast.success(t("settings.security.ipWhitelist.deleted"))
      setDeletingId(null)
      refetch()
    },
    onError: (error) => {
      showErrorFromException(error, t("settings.security.ipWhitelist.deleteFailed"))
    },
  })

  const updateSettingsMutation = trpc.settings.updateIpSecuritySettings.useMutation({
    onSuccess: () => {
      toast.success(t("settings.security.ipSecuritySettings.saved"))
      refetchSettings()
    },
    onError: (error) => {
      showErrorFromException(error, t("settings.security.ipSecuritySettings.saveFailed"))
    },
  })

  const form = useForm<IpWhitelistFormValues>({
    resolver: zodResolver(ipWhitelistSchema),
    defaultValues: {
      ipAddress: "",
      description: "",
    },
  })

  const handleSubmit = (values: IpWhitelistFormValues) => {
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        description: values.description || undefined,
      })
    } else {
      addMutation.mutate({
        ipAddress: values.ipAddress,
        description: values.description || undefined,
      })
    }
  }

  const handleToggleActive = (id: string, currentActive: boolean) => {
    updateMutation.mutate({
      id,
      isActive: !currentActive,
    })
  }

  const whitelists = whitelistsData?.whitelists || []

  return (
    <div className="space-y-6">
      {/* IP Security Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("settings.security.ipSecuritySettings.title")}
          </CardTitle>
          <CardDescription>{t("settings.security.ipSecuritySettings.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base">{t("settings.security.ipSecuritySettings.ipWhitelistEnabled")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.security.ipSecuritySettings.ipWhitelistEnabledDescription")}
              </p>
            </div>
            <Switch
              checked={ipSettings?.ipWhitelistEnabled || false}
              onCheckedChange={(checked) =>
                updateSettingsMutation.mutate({ ipWhitelistEnabled: checked })
              }
              disabled={updateSettingsMutation.isPending}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base">{t("settings.security.ipSecuritySettings.geographicRestrictionEnabled")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.security.ipSecuritySettings.geographicRestrictionEnabledDescription")}
              </p>
            </div>
            <Switch
              checked={ipSettings?.geographicRestrictionEnabled || false}
              onCheckedChange={(checked) =>
                updateSettingsMutation.mutate({ geographicRestrictionEnabled: checked })
              }
              disabled={updateSettingsMutation.isPending}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base">{t("settings.security.ipSecuritySettings.vpnDetectionEnabled")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.security.ipSecuritySettings.vpnDetectionEnabledDescription")}
              </p>
            </div>
            <Switch
              checked={ipSettings?.vpnDetectionEnabled || false}
              onCheckedChange={(checked) =>
                updateSettingsMutation.mutate({ vpnDetectionEnabled: checked })
              }
              disabled={updateSettingsMutation.isPending}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base">{t("settings.security.ipSecuritySettings.suspiciousLocationAlertsEnabled")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.security.ipSecuritySettings.suspiciousLocationAlertsEnabledDescription")}
              </p>
            </div>
            <Switch
              checked={ipSettings?.suspiciousLocationAlertsEnabled || false}
              onCheckedChange={(checked) =>
                updateSettingsMutation.mutate({ suspiciousLocationAlertsEnabled: checked })
              }
              disabled={updateSettingsMutation.isPending}
            />
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* IP Whitelist Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                {t("settings.security.ipWhitelist.title")}
              </CardTitle>
              <CardDescription>{t("settings.security.ipWhitelist.description")}</CardDescription>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("settings.security.ipWhitelist.add")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("settings.security.ipWhitelist.addTitle")}</DialogTitle>
                  <DialogDescription>{t("settings.security.ipWhitelist.addDescription")}</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="ipAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("settings.security.ipWhitelist.ipAddress")}</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="192.168.1.1 or 192.168.1.0/24"
                              {...field}
                              disabled={addMutation.isPending}
                            />
                          </FormControl>
                          <FormDescription>
                            {t("settings.security.ipWhitelist.ipAddressDescription")}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("settings.security.ipWhitelist.description")}</FormLabel>
                          <FormControl>
                            <Input
                              placeholder={t("settings.security.ipWhitelist.descriptionPlaceholder")}
                              {...field}
                              disabled={addMutation.isPending}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsAddDialogOpen(false)}
                        disabled={addMutation.isPending}
                      >
                        {t("common.cancel")}
                      </Button>
                      <Button type="submit" disabled={addMutation.isPending}>
                        {addMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t("common.loading")}
                          </>
                        ) : (
                          t("common.add")
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {whitelists.length === 0 ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{t("settings.security.ipWhitelist.empty")}</AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.security.ipWhitelist.ipAddress")}</TableHead>
                  <TableHead>{t("settings.security.ipWhitelist.description")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("settings.security.ipWhitelist.scope")}</TableHead>
                  <TableHead>{t("common.createdAt")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {whitelists.map((whitelist) => (
                  <TableRow key={whitelist.id}>
                    <TableCell className="font-mono">{whitelist.ipAddress}</TableCell>
                    <TableCell>{whitelist.description || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={whitelist.isActive}
                          onCheckedChange={() => handleToggleActive(whitelist.id, whitelist.isActive)}
                          disabled={updateMutation.isPending}
                        />
                        <Badge variant={whitelist.isActive ? "default" : "secondary"}>
                          {whitelist.isActive ? t("common.active") : t("common.inactive")}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {whitelist.userId ? t("settings.security.ipWhitelist.userSpecific") : t("settings.security.ipWhitelist.companyWide")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(whitelist.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingId(whitelist.id)
                            form.reset({
                              ipAddress: whitelist.ipAddress,
                              description: whitelist.description || "",
                            })
                            setIsAddDialogOpen(true)
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingId(whitelist.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Geographic Restrictions */}
      <GeographicRestrictionsManagement />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deletingId !== null} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.security.ipWhitelist.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.security.ipWhitelist.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingId) {
                  deleteMutation.mutate({ id: deletingId })
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function GeographicRestrictionsManagement() {
  const { t } = useTranslation()
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  const { data: restrictionsData, refetch } = trpc.settings.getGeographicRestrictions.useQuery()

  const addMutation = trpc.settings.addGeographicRestriction.useMutation({
    onSuccess: () => {
      toast.success(t("settings.security.geographicRestrictions.added"))
      setIsAddDialogOpen(false)
      form.reset()
      refetch()
    },
    onError: (error) => {
      showErrorFromException(error, t("settings.security.geographicRestrictions.addFailed"))
    },
  })

  const deleteMutation = trpc.settings.deleteGeographicRestriction.useMutation({
    onSuccess: () => {
      toast.success(t("settings.security.geographicRestrictions.deleted"))
      setDeletingId(null)
      refetch()
    },
    onError: (error) => {
      showErrorFromException(error, t("settings.security.geographicRestrictions.deleteFailed"))
    },
  })

  const form = useForm<{ countryCode: string; action: "ALLOW" | "BLOCK" }>({
    resolver: zodResolver(
      z.object({
        countryCode: z.string().length(2, "Country code must be 2 characters"),
        action: z.enum(["ALLOW", "BLOCK"]),
      })
    ),
    defaultValues: {
      countryCode: "",
      action: "BLOCK",
    },
  })

  const handleSubmit = (values: { countryCode: string; action: "ALLOW" | "BLOCK" }) => {
    addMutation.mutate({
      countryCode: values.countryCode.toUpperCase(),
      action: values.action,
    })
  }

  const restrictions = restrictionsData?.restrictions || []

  // Get list of countries (ISO 3166-1 alpha-2)
  // In a real app, you might want to fetch this from an API or use a library
  const countries = [
    { code: "US", name: "United States" },
    { code: "GB", name: "United Kingdom" },
    { code: "CA", name: "Canada" },
    { code: "AU", name: "Australia" },
    { code: "DE", name: "Germany" },
    { code: "FR", name: "France" },
    { code: "IT", name: "Italy" },
    { code: "ES", name: "Spain" },
    { code: "NL", name: "Netherlands" },
    { code: "BE", name: "Belgium" },
    { code: "CH", name: "Switzerland" },
    { code: "AT", name: "Austria" },
    { code: "SE", name: "Sweden" },
    { code: "NO", name: "Norway" },
    { code: "DK", name: "Denmark" },
    { code: "FI", name: "Finland" },
    { code: "PL", name: "Poland" },
    { code: "CZ", name: "Czech Republic" },
    { code: "IE", name: "Ireland" },
    { code: "PT", name: "Portugal" },
    { code: "GR", name: "Greece" },
    { code: "BD", name: "Bangladesh" },
    { code: "IN", name: "India" },
    { code: "CN", name: "China" },
    { code: "JP", name: "Japan" },
    { code: "KR", name: "South Korea" },
    { code: "SG", name: "Singapore" },
    { code: "MY", name: "Malaysia" },
    { code: "TH", name: "Thailand" },
    { code: "VN", name: "Vietnam" },
    { code: "PH", name: "Philippines" },
    { code: "ID", name: "Indonesia" },
    { code: "BR", name: "Brazil" },
    { code: "MX", name: "Mexico" },
    { code: "AR", name: "Argentina" },
    { code: "ZA", name: "South Africa" },
    { code: "EG", name: "Egypt" },
    { code: "AE", name: "United Arab Emirates" },
    { code: "SA", name: "Saudi Arabia" },
    { code: "TR", name: "Turkey" },
    { code: "RU", name: "Russia" },
    { code: "UA", name: "Ukraine" },
  ].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              {t("settings.security.geographicRestrictions.title")}
            </CardTitle>
            <CardDescription>{t("settings.security.geographicRestrictions.description")}</CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t("settings.security.geographicRestrictions.add")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("settings.security.geographicRestrictions.addTitle")}</DialogTitle>
                <DialogDescription>{t("settings.security.geographicRestrictions.addDescription")}</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="countryCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("settings.security.geographicRestrictions.country")}</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={addMutation.isPending}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={t("settings.security.geographicRestrictions.selectCountry")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {countries.map((country) => (
                              <SelectItem key={country.code} value={country.code}>
                                {country.name} ({country.code})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          {t("settings.security.geographicRestrictions.countryDescription")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="action"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("settings.security.geographicRestrictions.action")}</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={addMutation.isPending}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="BLOCK">{t("settings.security.geographicRestrictions.block")}</SelectItem>
                            <SelectItem value="ALLOW">{t("settings.security.geographicRestrictions.allow")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          {t("settings.security.geographicRestrictions.actionDescription")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsAddDialogOpen(false)}
                      disabled={addMutation.isPending}
                    >
                      {t("common.cancel")}
                    </Button>
                    <Button type="submit" disabled={addMutation.isPending}>
                        {addMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t("common.loading")}
                          </>
                        ) : (
                          t("common.add")
                        )}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {restrictions.length === 0 ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{t("settings.security.geographicRestrictions.empty")}</AlertDescription>
          </Alert>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("settings.security.geographicRestrictions.country")}</TableHead>
                <TableHead>{t("settings.security.geographicRestrictions.action")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead>{t("settings.security.geographicRestrictions.scope")}</TableHead>
                <TableHead>{t("common.createdAt")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {restrictions.map((restriction) => (
                <TableRow key={restriction.id}>
                  <TableCell>
                    {countries.find((c) => c.code === restriction.countryCode)?.name || restriction.countryCode}
                  </TableCell>
                  <TableCell>
                    <Badge variant={restriction.action === "BLOCK" ? "destructive" : "default"}>
                      {restriction.action === "BLOCK" ? t("settings.security.geographicRestrictions.block") : t("settings.security.geographicRestrictions.allow")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={restriction.isActive ? "default" : "secondary"}>
                      {restriction.isActive ? t("common.active") : t("common.inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {restriction.userId ? t("settings.security.geographicRestrictions.userSpecific") : t("settings.security.geographicRestrictions.companyWide")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(restriction.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletingId(restriction.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <AlertDialog open={deletingId !== null} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.security.geographicRestrictions.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.security.geographicRestrictions.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingId) {
                  deleteMutation.mutate({ id: deletingId })
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
