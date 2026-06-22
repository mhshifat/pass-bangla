"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Search, MoreHorizontal, Pencil, Trash2, Mail, Shield, Send } from "lucide-react"
import { UsersEmptyState } from "./users-empty-state"
import { useIsMobile } from "@/hooks/use-mobile"

interface User {
  id: string
  name: string
  email: string
  role: string
  status: string
  mfa?: boolean
  lastLogin?: string
  avatar: string
  isCreator?: boolean
}

interface UsersTableProps {
  users: User[]
  onEdit?: (user: User) => void
  onDelete?: (userId: string) => void
  onResetPassword?: (userId: string) => void
  onEmail?: (userId: string) => void
  onResetMfa?: (userId: string) => void
  onSendOnboarding?: (userId: string) => void
  onAddUser?: () => void
}

export function UsersTable({ users, onEdit, onDelete, onResetPassword, onEmail, onResetMfa, onSendOnboarding, onAddUser }: UsersTableProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [searchQuery, setSearchQuery] = React.useState("")

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const shouldShowSensitiveInfo = React.useCallback((user: User) => {
    if (user.isCreator) {
      return false;
    }

    return true;
  }, [])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("users.searchUsers")}
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredUsers.length === 0 ? (
          <UsersEmptyState 
            onAddUser={onAddUser}
            isSearching={searchQuery.length > 0}
          />
        ) : isMobile ? (
          // Mobile card layout
          <div className="space-y-4 md:hidden">
            {filteredUsers.map((user) => (
              <Card key={user.id} className="p-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={user.avatar} alt={user.name} />
                        <AvatarFallback>
                          {user.name.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{user.name}</div>
                        <div className="text-sm text-muted-foreground truncate">{user.email}</div>
                      </div>
                    </div>
                    {(onEdit || onEmail || onResetPassword || onResetMfa || onDelete) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>{t("common.actions")}</DropdownMenuLabel>
                          {user.isCreator ? (
                            <DropdownMenuItem disabled className="text-muted-foreground">
                              {t("users.cannotModifyCreator")}
                            </DropdownMenuItem>
                          ) : (
                            <>
                              <DropdownMenuSeparator />
                              {onEdit && (
                                <DropdownMenuItem onClick={() => onEdit(user)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  {t("common.edit")}
                                </DropdownMenuItem>
                              )}
                              {onEmail && (
                                <DropdownMenuItem onClick={() => onEmail(user.id)}>
                                  <Mail className="mr-2 h-4 w-4" />
                                  {t("users.sendEmail")}
                                </DropdownMenuItem>
                              )}
                              {onSendOnboarding && (
                                <DropdownMenuItem onClick={() => onSendOnboarding(user.id)}>
                                  <Send className="mr-2 h-4 w-4" />
                                  {t("users.sendOnboarding", "Send onboarding info")}
                                </DropdownMenuItem>
                              )}
                              {onResetPassword && (
                                <DropdownMenuItem onClick={() => onResetPassword(user.id)}>
                                  <Shield className="mr-2 h-4 w-4" />
                                  {t("users.resetPassword")}
                                </DropdownMenuItem>
                              )}
                              {onResetMfa && user.mfa && (
                                <DropdownMenuItem onClick={() => onResetMfa(user.id)}>
                                  <Shield className="mr-2 h-4 w-4" />
                                  {t("users.resetMfa")}
                                </DropdownMenuItem>
                              )}
                              {onDelete && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    className="text-red-600"
                                    onClick={() => onDelete(user.id)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    {t("common.delete")}
                                  </DropdownMenuItem>
                                </>
                              )}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t("common.role")}:</span>
                      <Badge
                        variant={
                          user.role === "Admin"
                            ? "default"
                            : user.role === "Manager"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {t(`users.roles.${user.role.toLowerCase()}`, { defaultValue: user.role })}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t("common.status")}:</span>
                      <Badge variant={user.status === "active" ? "default" : "secondary"}>
                        {user.status === "active" ? t("common.active") : t("common.inactive")}
                      </Badge>
                    </div>
                    {shouldShowSensitiveInfo(user) && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{t("users.mfaEnabled")}:</span>
                        {user.mfa ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            {t("mfa.enabled")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                            {t("mfa.disabled")}
                          </Badge>
                        )}
                      </div>
                    )}
                    {user.lastLogin && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{t("users.lastLogin")}:</span>
                        <span className="text-sm">{user.lastLogin}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("audit.user")}</TableHead>
              <TableHead>{t("common.role")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead>{t("users.mfaEnabled")}</TableHead>
              <TableHead>{t("users.lastLogin")}</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.avatar} alt={user.name} />
                      <AvatarFallback>
                        {user.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{user.name}</div>
                      <div className="text-sm text-muted-foreground">{user.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      user.role === "Admin"
                        ? "default"
                        : user.role === "Manager"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {t(`users.roles.${user.role.toLowerCase()}`, { defaultValue: user.role })}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={user.status === "active" ? "default" : "secondary"}>
                    {user.status === "active" ? t("common.active") : t("common.inactive")}
                  </Badge>
                </TableCell>
                <TableCell>
                    {shouldShowSensitiveInfo(user) ? (
                      <>
                        {user.mfa ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            {t("mfa.enabled")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                            {t("mfa.disabled")}
                          </Badge>
                        )}
                      </>
                    ) : "-"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.lastLogin || '-'}
                  </TableCell>
                <TableCell className="text-right">
                  {(onEdit || onEmail || onResetPassword || onResetMfa || onDelete) ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>{t("common.actions")}</DropdownMenuLabel>
                        {user.isCreator ? (
                          <DropdownMenuItem disabled className="text-muted-foreground">
                            {t("users.cannotModifyCreator")}
                          </DropdownMenuItem>
                        ) : (
                          <>
                            <DropdownMenuSeparator />
                            {onEdit && (
                              <DropdownMenuItem onClick={() => onEdit(user)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                {t("common.edit")}
                              </DropdownMenuItem>
                            )}
                            {onEmail && (
                              <DropdownMenuItem onClick={() => onEmail(user.id)}>
                                <Mail className="mr-2 h-4 w-4" />
                                {t("users.sendEmail")}
                              </DropdownMenuItem>
                            )}
                            {onSendOnboarding && (
                              <DropdownMenuItem onClick={() => onSendOnboarding(user.id)}>
                                <Send className="mr-2 h-4 w-4" />
                                {t("users.sendOnboarding", "Send onboarding info")}
                              </DropdownMenuItem>
                            )}
                            {onResetPassword && (
                              <DropdownMenuItem onClick={() => onResetPassword(user.id)}>
                                <Shield className="mr-2 h-4 w-4" />
                                {t("users.resetPassword")}
                              </DropdownMenuItem>
                            )}
                            {onResetMfa && user.mfa && (
                              <DropdownMenuItem onClick={() => onResetMfa(user.id)}>
                                <Shield className="mr-2 h-4 w-4" />
                                {t("users.resetMfa")}
                              </DropdownMenuItem>
                            )}
                            {onDelete && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  className="text-red-600"
                                  onClick={() => onDelete(user.id)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  {t("common.delete")}
                                </DropdownMenuItem>
                              </>
                            )}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
      </CardContent>
    </Card>
  )
}
