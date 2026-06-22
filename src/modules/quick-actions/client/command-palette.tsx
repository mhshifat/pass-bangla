"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import {
  Lock,
  Plus,
  Clock,
  Search,
  FileText,
  Users,
  UserPlus,
  Shield,
  Settings,
  BarChart3,
  Activity,
  BoxesIcon,
  LayoutDashboard,
} from "lucide-react"
import { trpc } from "@/trpc/client"
import { PasswordFormDialog } from "@/modules/passwords/client/password-form-dialog"
import { usePermissions } from "@/hooks/use-permissions"
import { KeyboardShortcuts } from "./keyboard-shortcuts"

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const { hasPermission } = usePermissions()
  const [searchQuery, setSearchQuery] = React.useState("")
  const [isCreatePasswordOpen, setIsCreatePasswordOpen] = React.useState(false)
  const [isShortcutsOpen, setIsShortcutsOpen] = React.useState(false)

  // Fetch recent passwords
  const { data: recentPasswords } = trpc.quickActions.recentPasswords.useQuery(
    { limit: 5 },
    { enabled: open && hasPermission("password.view") }
  )

  // Search passwords
  const { data: searchResults } = trpc.quickActions.searchPasswords.useQuery(
    { query: searchQuery, limit: 10 },
    { enabled: open && searchQuery.length > 0 && hasPermission("password.view") }
  )

  const runCommand = React.useCallback(
    (command: () => void) => {
      setSearchQuery("")
      onOpenChange(false)
      command()
    },
    [onOpenChange]
  )

  // Navigation commands
  const navigationCommands = [
    {
      name: t("quickActions.navigate.dashboard"),
      icon: LayoutDashboard,
      shortcut: "⌘D",
      action: () => router.push("/admin"),
      permission: null,
    },
    {
      name: t("quickActions.navigate.passwords"),
      icon: Lock,
      shortcut: "⌘P",
      action: () => router.push("/admin/passwords"),
      permission: "password.view",
    },
    {
      name: t("quickActions.navigate.users"),
      icon: Users,
      shortcut: "⌘U",
      action: () => router.push("/admin/users"),
      permission: "user.view",
    },
    {
      name: t("quickActions.navigate.teams"),
      icon: BoxesIcon,
      shortcut: "⌘T",
      action: () => router.push("/admin/teams"),
      permission: "team.view",
    },
    {
      name: t("quickActions.navigate.roles"),
      icon: Shield,
      shortcut: "⌘R",
      action: () => router.push("/admin/roles"),
      permission: "role.manage",
    },
    {
      name: t("quickActions.navigate.auditLogs"),
      icon: Activity,
      shortcut: "⌘A",
      action: () => router.push("/admin/audit-logs"),
      permission: "audit.view",
    },
    {
      name: t("quickActions.navigate.reports"),
      icon: FileText,
      shortcut: "⌘F",
      action: () => router.push("/admin/reports"),
      permission: "report.view",
    },
    {
      name: t("quickActions.navigate.insights"),
      icon: BarChart3,
      shortcut: "⌘I",
      action: () => router.push("/admin/insights"),
      permission: "password.view",
    },
    {
      name: t("quickActions.navigate.settings"),
      icon: Settings,
      shortcut: "⌘,",
      action: () => router.push("/admin/settings/general"),
      permission: "settings.view",
    },
  ].filter((cmd) => !cmd.permission || hasPermission(cmd.permission))

  // Action commands
  const actionCommands = [
    {
      name: t("quickActions.actions.createPassword"),
      icon: Plus,
      shortcut: "⌘N",
      action: () => setIsCreatePasswordOpen(true),
      permission: "password.create",
    },
    {
      name: t("quickActions.actions.createUser", "Create user"),
      icon: UserPlus,
      shortcut: undefined,
      action: () => router.push("/admin/users?new=1"),
      permission: "user.create",
    },
    {
      name: t("quickActions.shortcuts.title"),
      icon: Search,
      shortcut: "?",
      action: () => setIsShortcutsOpen(true),
      permission: null,
    },
  ].filter((cmd) => !cmd.permission || hasPermission(cmd.permission))

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        title={t("quickActions.title")}
        description={t("quickActions.description")}
      >
        <div className="border-b">
          <CommandInput
            placeholder={t("quickActions.searchPlaceholder")}
            value={searchQuery}
            onValueChange={setSearchQuery}
            className="border-0 focus:ring-0"
          />
        </div>
        <CommandList className="max-h-[500px]">
          <CommandEmpty className="py-8 text-sm text-muted-foreground">
            {t("quickActions.noResults")}
          </CommandEmpty>

          {/* Search Results */}
          {searchQuery.length > 0 && searchResults && searchResults.length > 0 && (
            <>
              <CommandGroup heading={t("quickActions.searchResults")}>
                {searchResults.map((password) => (
                  <CommandItem
                    key={password.id}
                    value={`password-${password.id}`}
                    onSelect={() =>
                      runCommand(() => {
                        router.push("/admin/passwords")
                        // Dispatch event to open password details dialog
                        setTimeout(() => {
                          window.dispatchEvent(
                            new CustomEvent("openPasswordDetails", { detail: { passwordId: password.id } })
                          )
                        }, 100)
                      })
                    }
                    className="cursor-pointer"
                  >
                    <Lock className="mr-3 h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="font-medium truncate">{password.name}</span>
                      {password.username && (
                        <span className="text-xs text-muted-foreground truncate">
                          {password.username}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator className="my-1" />
            </>
          )}

          {/* Recent Passwords */}
          {searchQuery.length === 0 && recentPasswords && recentPasswords.length > 0 && (
            <>
              <CommandGroup heading={t("quickActions.recentPasswords")}>
                {recentPasswords.map((password) => (
                  <CommandItem
                    key={password.id}
                    value={`recent-${password.id}`}
                    onSelect={() =>
                      runCommand(() => {
                        router.push("/admin/passwords")
                        // Dispatch event to open password details dialog
                        setTimeout(() => {
                          window.dispatchEvent(
                            new CustomEvent("openPasswordDetails", { detail: { passwordId: password.id } })
                          )
                        }, 100)
                      })
                    }
                    className="cursor-pointer"
                  >
                    <Clock className="mr-3 h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="font-medium truncate">{password.name}</span>
                      {password.username && (
                        <span className="text-xs text-muted-foreground truncate">
                          {password.username}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator className="my-1" />
            </>
          )}

          {/* Actions */}
          {actionCommands.length > 0 && (
            <CommandGroup heading={t("quickActions.actions.title")}>
              {actionCommands.map((command) => {
                const Icon = command.icon
                return (
                  <CommandItem
                    key={command.name}
                    value={command.name}
                    onSelect={() => runCommand(command.action)}
                    className="cursor-pointer"
                  >
                    <Icon className="mr-3 h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">{command.name}</span>
                    <CommandShortcut className="ml-2">{command.shortcut}</CommandShortcut>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )}

          {/* Navigation */}
          {navigationCommands.length > 0 && (
            <CommandGroup heading={t("quickActions.navigate.title")}>
              {navigationCommands.map((command) => {
                const Icon = command.icon
                return (
                  <CommandItem
                    key={command.name}
                    value={command.name}
                    onSelect={() => runCommand(command.action)}
                    className="cursor-pointer"
                  >
                    <Icon className="mr-3 h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">{command.name}</span>
                    <CommandShortcut className="ml-2">{command.shortcut}</CommandShortcut>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>

      {/* Quick Password Creation Dialog */}
      <PasswordFormDialog
        open={isCreatePasswordOpen}
        onOpenChange={setIsCreatePasswordOpen}
        mode="create"
      />

      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcuts open={isShortcutsOpen} onOpenChange={setIsShortcutsOpen} />
    </>
  )
}

