"use client"

import * as React from "react"
import { useState, useEffect, useRef } from "react"
import { useActionState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createRotationPolicyAction, updateRotationPolicyAction } from "@/app/admin/passwords/rotation-actions"
import { toast } from "sonner"

interface RotationPolicyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  policy?: {
    id: string
    name?: string | null
    description?: string | null
    rotationDays?: number | null
    reminderDays?: number | null
    autoRotate?: boolean | null
    requireApproval?: boolean | null
    isActive?: boolean | null
  }
  onSuccess?: () => void
}

export function RotationPolicyDialog({
  open,
  onOpenChange,
  policy,
  onSuccess,
}: RotationPolicyDialogProps) {
  const { t } = useTranslation()
  const isEditing = !!policy
  const hasCalledSuccess = useRef(false)

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    rotationDays: 90,
    reminderDays: 7,
    autoRotate: false,
    requireApproval: false,
    isActive: true,
  })

  const [createState, createAction, isCreating] = useActionState(
    async (_prevState: unknown, formData: FormData) => {
      const data = {
        name: formData.get("name") as string,
        description: formData.get("description") as string || undefined,
        rotationDays: parseInt(formData.get("rotationDays") as string),
        reminderDays: parseInt(formData.get("reminderDays") as string),
        autoRotate: formData.get("autoRotate") === "on",
        requireApproval: formData.get("requireApproval") === "on",
        isActive: formData.get("isActive") === "on",
      }

      const result = await createRotationPolicyAction(data)
      return result
    },
    null
  )

  const [updateState, updateAction, isUpdating] = useActionState(
    async (_prevState: unknown, formData: FormData) => {
      if (!policy) return { success: false, error: "No policy to update" }

      const data = {
        name: formData.get("name") as string,
        description: formData.get("description") as string || undefined,
        rotationDays: parseInt(formData.get("rotationDays") as string),
        reminderDays: parseInt(formData.get("reminderDays") as string),
        autoRotate: formData.get("autoRotate") === "on",
        requireApproval: formData.get("requireApproval") === "on",
        isActive: formData.get("isActive") === "on",
      }

      const result = await updateRotationPolicyAction(policy.id, data)
      return result
    },
    null
  )

  useEffect(() => {
    if (policy) {
      // Use a callback to defer state update to next effect cycle
      const timer = setTimeout(() => {
        setFormData({
          name: policy.name || "",
          description: policy.description || "",
          rotationDays: policy.rotationDays || 90,
          reminderDays: policy.reminderDays || 7,
          autoRotate: policy.autoRotate || false,
          requireApproval: policy.requireApproval || false,
          isActive: policy.isActive !== undefined ? policy.isActive : true,
        })
      }, 0)
      return () => clearTimeout(timer)
    } else {
      const timer = setTimeout(() => {
        setFormData({
          name: "",
          description: "",
          rotationDays: 90,
          reminderDays: 7,
          autoRotate: false,
          requireApproval: false,
          isActive: true,
        })
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [policy, open])

  useEffect(() => {
    if (createState?.success && !hasCalledSuccess.current) {
      hasCalledSuccess.current = true
      toast.success(t("passwords.rotation.policyCreated"))
      onOpenChange(false)
      // Call onSuccess after closing dialog to avoid re-render issues
      setTimeout(() => {
        onSuccess?.()
        hasCalledSuccess.current = false
      }, 100)
    } else if (createState?.error) {
      toast.error(createState.error)
      hasCalledSuccess.current = false
    }
  }, [createState, t, onSuccess, onOpenChange])

  useEffect(() => {
    if (updateState?.success && !hasCalledSuccess.current) {
      hasCalledSuccess.current = true
      toast.success(t("passwords.rotation.policyUpdated"))
      onOpenChange(false)
      // Call onSuccess after closing dialog to avoid re-render issues
      setTimeout(() => {
        onSuccess?.()
        hasCalledSuccess.current = false
      }, 100)
    } else if (updateState?.error) {
      toast.error(updateState.error)
      hasCalledSuccess.current = false
    }
  }, [updateState, t, onSuccess, onOpenChange])

  // Reset flag when dialog opens/closes
  useEffect(() => {
    if (!open) {
      hasCalledSuccess.current = false
    }
  }, [open])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    if (isEditing) {
      updateAction(new FormData(form))
    } else {
      createAction(new FormData(form))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t("passwords.rotation.editPolicy") : t("passwords.rotation.createPolicy")}
          </DialogTitle>
          <DialogDescription>
            {t("passwords.rotation.policyDialogDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("common.name")} *</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t("common.description")}</Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rotationDays">{t("passwords.rotation.rotationDays")} *</Label>
                <Input
                  id="rotationDays"
                  name="rotationDays"
                  type="number"
                  min="1"
                  value={formData.rotationDays}
                  onChange={(e) => setFormData({ ...formData, rotationDays: parseInt(e.target.value) || 90 })}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {t("passwords.rotation.rotationDaysHint")}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reminderDays">{t("passwords.rotation.reminderDays")} *</Label>
                <Input
                  id="reminderDays"
                  name="reminderDays"
                  type="number"
                  min="0"
                  value={formData.reminderDays}
                  onChange={(e) => setFormData({ ...formData, reminderDays: parseInt(e.target.value) || 7 })}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {t("passwords.rotation.reminderDaysHint")}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="autoRotate"
                  name="autoRotate"
                  checked={formData.autoRotate}
                  onCheckedChange={(checked) => setFormData({ ...formData, autoRotate: checked === true })}
                />
                <Label htmlFor="autoRotate" className="cursor-pointer">
                  {t("passwords.rotation.autoRotate")}
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="requireApproval"
                  name="requireApproval"
                  checked={formData.requireApproval}
                  onCheckedChange={(checked) => setFormData({ ...formData, requireApproval: checked === true })}
                />
                <Label htmlFor="requireApproval" className="cursor-pointer">
                  {t("passwords.rotation.requireApproval")}
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isActive"
                  name="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked === true })}
                />
                <Label htmlFor="isActive" className="cursor-pointer">
                  {t("common.active")}
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isCreating || isUpdating}>
              {isCreating || isUpdating
                ? t("common.loading")
                : isEditing
                ? t("common.save")
                : t("common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

