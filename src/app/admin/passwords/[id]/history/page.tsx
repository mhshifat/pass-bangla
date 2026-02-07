import { redirect } from "next/navigation"
import { caller } from "@/trpc/server"
import { PasswordHistoryPageClient } from "./password-history-page-client"

interface PasswordHistoryPageProps {
  params: Promise<{ id: string }>
}

export default async function PasswordHistoryPage({ params }: PasswordHistoryPageProps) {
  const { id } = await params

  // Verify password exists and user has permission
  let password: Awaited<ReturnType<typeof caller.passwords.getById>> | null = null
  
  try {
    password = await caller.passwords.getById({ id })
  } catch {
    redirect("/admin/passwords")
  }
  
  if (!password || !password.isOwner) {
    redirect("/admin/passwords")
  }

  return <PasswordHistoryPageClient passwordId={id} passwordName={password.name} />
}
