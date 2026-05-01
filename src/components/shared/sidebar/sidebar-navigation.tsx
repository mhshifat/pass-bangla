"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  Shield,
  Settings,
  Lock,
  Activity,
  ChevronRight,
  BoxesIcon,
  FileText,
  BarChart3,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { usePermissions } from "@/hooks/use-permissions"
import { useTranslation } from "react-i18next"

// Navigation structure with translation keys
const navigationStructure = [
  {
    nameKey: "dashboard.title",
    href: "/admin",
    icon: LayoutDashboard,
    permission: null, // Always visible
  },
  {
    nameKey: "users.title",
    href: "/admin/users",
    icon: Users,
    permission: "user.view",
  },
  {
    nameKey: "teams.title",
    href: "/admin/teams",
    icon: BoxesIcon,
    permission: "team.view",
  },
  {
    nameKey: "roles.title",
    href: "/admin/roles",
    icon: Shield,
    permission: "role.manage",
  },
  {
    nameKey: "passwords.title",
    href: "/admin/passwords",
    icon: Lock,
    permission: "password.view",
    children: [
      { nameKey: "passwords.favorites.title", href: "/admin/passwords/favorites", permission: "password.view" },
      { nameKey: "passwords.tags.title", href: "/admin/passwords/tags", permission: "password.view" },
      { nameKey: "passwords.templates.title", href: "/admin/passwords/templates", permission: "password.view" },
      { nameKey: "passwords.duplicates.title", href: "/admin/passwords/duplicates", permission: "password.view" },
      { nameKey: "passwords.breach.title", href: "/admin/passwords/breaches", permission: "password.view" },
      { nameKey: "passwords.rotation.title", href: "/admin/passwords/rotation", permission: "password.view" },
      { nameKey: "passwords.shares.title", href: "/admin/passwords/shares", permission: "password.view" },
    ],
  },
  {
    nameKey: "audit.title",
    href: "/admin/audit-logs",
    icon: Activity,
    permission: "audit.view",
  },
  {
    nameKey: "reports.title",
    href: "/admin/reports",
    icon: FileText,
    permission: "report.view",
  },
  {
    nameKey: "insights.title",
    href: "/admin/insights",
    icon: BarChart3,
    permission: "password.view", // Basic permission to view insights
  },
  {
    nameKey: "settings.title",
    href: "/admin/settings/general",
    icon: Settings,
    permission: "settings.view",
    children: [
      { nameKey: "settings.general", href: "/admin/settings/general", permission: "settings.view" },
      { nameKey: "settings.emailMenu", href: "/admin/settings/email", permission: "settings.view" },
      { nameKey: "settings.securityMenu", href: "/admin/settings/security", permission: "settings.view" },
      { nameKey: "settings.mfaMenu", href: "/admin/settings/mfa", permission: "settings.view" },
      { nameKey: "settings.mfaCredentials", href: "/admin/settings/mfa-credentials", permission: "settings.view" },
      { nameKey: "settings.complianceMenu", href: "/admin/settings/compliance", permission: "settings.view" },
    ],
  },
]

interface SidebarNavigationProps {
  isCollapsed: boolean
}

export function SidebarNavigation({ isCollapsed }: SidebarNavigationProps) {
  const { t } = useTranslation()
  const pathname = usePathname()
  const { hasPermission } = usePermissions()

  // Build navigation with translated names
  const navigation = navigationStructure.map((item) => ({
    ...item,
    name: t(item.nameKey),
    children: item.children?.map((child) => ({
      ...child,
      name: t(child.nameKey),
    })),
  }))

  // Initialize expanded items with translated Settings and Passwords names
  const settingsName = t("settings.title")
  const passwordsName = t("passwords.title")
  const [expandedItems, setExpandedItems] = React.useState<string[]>([settingsName, passwordsName])

  const toggleExpand = (name: string) => {
    setExpandedItems((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    )
  }

  // Filter navigation items based on permissions
  const filteredNavigation = navigation.filter((item) => {
    if (!item.permission) return true // Always show items without permission requirement
    return hasPermission(item.permission)
  }).map((item) => {
    if (item.children) {
      return {
        ...item,
        children: item.children.filter((child) => {
          if (!child.permission) return true
          return hasPermission(child.permission)
        }),
      }
    }
    return item
  }).filter((item) => {
    // Hide parent items if all children are filtered out
    if (item.children && item.children.length === 0) return false
    return true
  })

  if (isCollapsed) {
    return (
      <ScrollArea className="flex-1 px-2 py-4">
        <TooltipProvider delayDuration={0}>
          <nav className="space-y-2">
            {filteredNavigation.map((item) => {
              const isActive = item.href === pathname

              if (item.children) {
                // For collapsed mode with children, show dropdown menu
                const isParentActive = item.href === pathname || item.children.some(child => child.href === pathname)
                return (
                  <DropdownMenu key={item.name}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <button
                            className={cn(
                              "flex w-full items-center justify-center rounded-lg p-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                              isParentActive
                                ? "bg-accent text-accent-foreground"
                                : "text-muted-foreground"
                            )}
                          >
                            <item.icon className="h-5 w-5" />
                          </button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>{item.name}</p>
                      </TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent side="right" align="start" className="w-48">
                      {item.href && (
                        <>
                          <DropdownMenuItem asChild>
                            <Link href={item.href} className="cursor-pointer font-medium">
                              {item.name}
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      {item.children.map((child) => (
                        <DropdownMenuItem key={child.href} asChild>
                          <Link href={child.href} className="cursor-pointer">
                            {child.name}
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              }

              return (
                <Tooltip key={item.name}>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center justify-center rounded-lg p-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>{item.name}</p>
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </nav>
        </TooltipProvider>
      </ScrollArea>
    )
  }

  return (
    <ScrollArea className="flex-1 px-3 py-4 min-h-0">
      <nav className="space-y-1">
        {filteredNavigation.map((item) => {
          const isActive = item.href === pathname
          const isExpanded = expandedItems.includes(item.name)

          if (item.children) {
            const isParentActive = item.href === pathname || item.children.some(child => child.href === pathname)
            return (
              <div key={item.name}>
                <div className="flex items-center">
                  <Link
                    href={item.href || "#"}
                    id={item.href === "/admin" ? "tour-dashboard" : item.href === "/admin/users" ? "tour-users" : item.href === "/admin/teams" ? "tour-teams" : item.href === "/admin/roles" ? "tour-roles" : item.href === "/admin/audit-logs" ? "tour-audit-logs" : item.href?.startsWith("/admin/settings") ? "tour-settings" : item.href?.startsWith("/admin/passwords") ? "tour-passwords" : undefined}
                    className={cn(
                      "flex flex-1 items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                      isParentActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    <item.icon className="mr-3 h-4 w-4" />
                    {item.name}
                  </Link>
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      toggleExpand(item.name)
                    }}
                    className="p-1 rounded hover:bg-accent"
                    aria-label={isExpanded ? t("common.collapse") : t("common.expand")}
                  >
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 transition-transform",
                        isExpanded && "rotate-90"
                      )}
                    />
                  </button>
                </div>
                {isExpanded && (
                  <div className="ml-7 mt-1 space-y-1">
                    {item.children.map((child) => {
                      const isChildActive = child.href === pathname
                      const tourId = child.href === "/admin/passwords/favorites" ? "tour-favorites" :
                        child.href === "/admin/passwords/tags" ? "tour-tags" :
                        child.href === "/admin/passwords/templates" ? "tour-templates" :
                        child.href === "/admin/passwords/duplicates" ? "tour-duplicate-detection" :
                        child.href === "/admin/passwords/breaches" ? "tour-breach-detection" :
                        child.href === "/admin/passwords/rotation" ? "tour-rotation" :
                        child.href === "/admin/passwords/shares" ? "tour-shares" :
                        child.href === "/admin/settings/general" ? "tour-settings-general" :
                        child.href === "/admin/settings/email" ? "tour-settings-email" :
                        child.href === "/admin/settings/security" ? "tour-settings-security" :
                        child.href === "/admin/settings/mfa" ? "tour-settings-mfa" :
                        child.href === "/admin/settings/mfa-credentials" ? "tour-settings-mfa-credentials" :
                        undefined
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          id={tourId}
                          className={cn(
                            "block rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                            isChildActive
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground"
                          )}
                        >
                          {child.name}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              id={item.href === "/admin" ? "tour-dashboard" : item.href === "/admin/users" ? "tour-users" : item.href === "/admin/teams" ? "tour-teams" : item.href === "/admin/roles" ? "tour-roles" : item.href === "/admin/audit-logs" ? "tour-audit-logs" : item.href?.startsWith("/admin/settings") ? "tour-settings" : item.href?.startsWith("/admin/passwords") ? "tour-passwords" : undefined}
              className={cn(
                "flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground"
              )}
            >
              <item.icon className="mr-3 h-4 w-4" />
              {item.name}
            </Link>
          )
        })}
      </nav>
    </ScrollArea>
  )
}
