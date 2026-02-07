import { redirect } from "next/navigation"
import { caller } from "@/trpc/server"
import { PasswordComparePageClient } from "./password-compare-page-client"

interface PasswordComparePageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ historyId1?: string; historyId2?: string }>
}

export default async function PasswordComparePage({ params, searchParams }: PasswordComparePageProps) {
  const { id } = await params
  const { historyId1, historyId2 } = await searchParams

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

  return (
    <PasswordComparePageClient
      passwordId={id}
      passwordName={password.name}
      historyId1={historyId1}
      historyId2={historyId2}
    />
  )
}
