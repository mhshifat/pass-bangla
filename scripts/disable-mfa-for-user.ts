/**
 * Script to disable MFA for a specific user
 * Usage: tsx scripts/disable-mfa-for-user.ts <email>
 */

import prisma from "../src/lib/prisma"

async function disableMfaForUser(email: string) {
  try {
    const user = await prisma.user.findFirst({
      where: { email },
      select: { id: true, name: true, email: true, mfaEnabled: true, role: true }
    })

    if (!user) {
      console.error(`❌ User with email "${email}" not found`)
      process.exit(1)
    }

    console.log(`📋 Found user:`)
    console.log(`   Name: ${user.name}`)
    console.log(`   Email: ${user.email}`)
    console.log(`   Role: ${user.role}`)
    console.log(`   MFA Enabled: ${user.mfaEnabled}`)

    if (!user.mfaEnabled) {
      console.log(`✅ MFA is already disabled for this user`)
      process.exit(0)
    }

    // Disable MFA
    await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaMethod: null,
      }
    })

    // Delete any MFA credentials (WebAuthn)
    const deletedCredentials = await prisma.mfaCredential.deleteMany({
      where: { userId: user.id }
    })

    // Delete recovery codes
    const deletedRecoveryCodes = await prisma.recoveryCode.deleteMany({
      where: { userId: user.id }
    })

    console.log(`✅ MFA disabled successfully!`)
    console.log(`   - Deleted ${deletedCredentials.count} MFA credentials`)
    console.log(`   - Deleted ${deletedRecoveryCodes.count} recovery codes`)

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
  console.log("Usage: tsx scripts/disable-mfa-for-user.ts <email>")
  process.exit(1)
}

disableMfaForUser(email)

