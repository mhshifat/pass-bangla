/**
 * Permission definitions and helper utilities
 */

export const PERMISSION_DEFINITIONS = {
  "user.create": { name: "Create Users", category: "User Management" },
  "user.edit": { name: "Edit Users", category: "User Management" },
  "user.delete": { name: "Delete Users", category: "User Management" },
  "user.view": { name: "View Users", category: "User Management" },
  "password.create": { name: "Create Passwords", category: "Password Management" },
  "password.edit": { name: "Edit Passwords", category: "Password Management" },
  "password.delete": { name: "Delete Passwords", category: "Password Management" },
  "password.view": { name: "View Passwords", category: "Password Management" },
  "password.share": { name: "Share Passwords", category: "Password Management" },
  "team.create": { name: "Create Teams", category: "Team Management" },
  "team.edit": { name: "Edit Teams", category: "Team Management" },
  "team.delete": { name: "Delete Teams", category: "Team Management" },
  "team.view": { name: "View Teams", category: "Team Management" },
  "settings.view": { name: "View Settings", category: "System Settings" },
  "settings.edit": { name: "Edit Settings", category: "System Settings" },
  "audit.view": { name: "View Audit Logs", category: "System Settings" },
  "role.manage": { name: "Manage Roles", category: "System Settings" },
  "report.view": { name: "View Reports", category: "Reports" },
  "report.create": { name: "Create Reports", category: "Reports" },
  "report.update": { name: "Update Reports", category: "Reports" },
  "report.delete": { name: "Delete Reports", category: "Reports" },
} as const

/**
 * Get friendly names for permission keys
 */
export function getPermissionNames(keys: string[]): string[] {
  return keys.map(
    (key) => PERMISSION_DEFINITIONS[key as keyof typeof PERMISSION_DEFINITIONS]?.name || key
  )
}

/**
 * Format permission keys into a human-readable list
 */
export function formatPermissionList(keys: string[]): string {
  const names = getPermissionNames(keys)
  if (names.length === 0) return ""
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} or ${names[1]}`
  return `${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}`
}
