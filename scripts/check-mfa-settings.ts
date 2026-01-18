/**
 * Script to check MFA settings for a user and global settings
 * Usage: tsx scripts/check-mfa-settings.ts <email>
 */

import prisma from "../src/lib/prisma"

async function checkMfaSettings(email: string) {
  try {
    // Get user info
    const user = await prisma.user.findFirst({
      where: { email },
      select: { 
        id: true, 
        name: true, 
        email: true, 
        mfaEnabled: true, 
        mfaMethod: true,
        mfaSecret: true,
        role: true,
        _count: {
          select: {
            mfaCredentials: true,
            recoveryCodes: true
          }
        }
      }
    })

    if (!user) {
      console.error(`❌ User with email "${email}" not found`)
      process.exit(1)
    }

    console.log(`\n👤 USER INFO:`)
    console.log(`   Name: ${user.name}`)
    console.log(`   Email: ${user.email}`)
    console.log(`   Role: ${user.role}`)
    console.log(`   MFA Enabled: ${user.mfaEnabled}`)
    console.log(`   MFA Method: ${user.mfaMethod || "None"}`)
    console.log(`   Has MFA Secret: ${user.mfaSecret ? "Yes" : "No"}`)
    console.log(`   MFA Credentials: ${user._count.mfaCredentials}`)
    console.log(`   Recovery Codes: ${user._count.recoveryCodes}`)

    // Get global MFA settings
    const settings = await prisma.settings.findMany({
      where: {
        key: {
          in: ["mfa.enforce_all_users", "mfa.enforce_admins"]
        }
      }
    })

    console.log(`\n⚙️  GLOBAL MFA SETTINGS:`)
    const settingsMap = new Map(settings.map(s => [s.key, s.value]))
    console.log(`   Enforce All Users: ${settingsMap.get("mfa.enforce_all_users") ?? false}`)
    console.log(`   Enforce Admins: ${settingsMap.get("mfa.enforce_admins") ?? false}`)

    // Determine if MFA will be enforced
    const enforceAllUsers = settingsMap.get("mfa.enforce_all_users") === true
    const enforceAdmins = settingsMap.get("mfa.enforce_admins") === true
    const isAdmin = ["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(user.role)
    
    let willEnforceMfa = user.mfaEnabled
    if (enforceAllUsers) willEnforceMfa = true
    if (enforceAdmins && isAdmin) willEnforceMfa = true

    console.log(`\n🔒 MFA ENFORCEMENT:`)
    console.log(`   Will MFA be enforced? ${willEnforceMfa ? "YES" : "NO"}`)
    if (willEnforceMfa) {
      console.log(`   Reason:`)
      if (user.mfaEnabled) console.log(`     - User has MFA enabled`)
      if (enforceAllUsers) console.log(`     - Global enforcement for all users`)
      if (enforceAdmins && isAdmin) console.log(`     - Global enforcement for admins (user is ${user.role})`)
    }

  } catch (error) {
    console.error("❌ Error:", error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

const email = process.argv[2]

if (!email) {
  console.error("❌ Please provide an email address")
  console.log("Usage: tsx scripts/check-mfa-settings.ts <email>")
  process.exit(1)
}

checkMfaSettings(email)

