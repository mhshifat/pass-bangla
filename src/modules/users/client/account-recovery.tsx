"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { Loader2, Mail, Shield, CheckCircle2, X, Plus, Trash2, AlertTriangle } from "lucide-react"
import { showErrorFromException } from "@/lib/error-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
// Security questions list - defined here to avoid importing server-only code
const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What city were you born in?",
  "What was your mother's maiden name?",
  "What was the name of your elementary school?",
  "What was your childhood nickname?",
  "What is the name of your favorite teacher?",
  "What was the make of your first car?",
  "What is your favorite movie?",
  "What is the name of the street you grew up on?",
  "What was your favorite food as a child?",
] as const

interface AccountRecoveryProps {
  user: {
    id: string
    email: string
  }
  onUpdate?: () => void
}

export function AccountRecovery({ user, onUpdate }: AccountRecoveryProps) {
  const { t } = useTranslation()
  const [recoveryEmail, setRecoveryEmail] = React.useState("")
  const [isRecoveryEmailDialogOpen, setIsRecoveryEmailDialogOpen] = React.useState(false)
  const [securityQuestions, setSecurityQuestions] = React.useState<
    Array<{ question: string; answer: string }>
  >([])
  const [isSecurityQuestionsDialogOpen, setIsSecurityQuestionsDialogOpen] = React.useState(false)

  const { data: recoveryEmailData, refetch: refetchRecoveryEmail } = trpc.auth.getRecoveryEmail.useQuery()
  const { data: securityQuestionsData, refetch: refetchSecurityQuestions } = trpc.auth.getSecurityQuestions.useQuery()

  const setRecoveryEmailMutation = trpc.auth.setRecoveryEmail.useMutation({
    onSuccess: () => {
      toast.success(t("profile.recoveryEmail.setSuccess"))
      setIsRecoveryEmailDialogOpen(false)
      setRecoveryEmail("")
      refetchRecoveryEmail()
      onUpdate?.()
    },
    onError: (error) => {
      showErrorFromException(error, t("profile.recoveryEmail.setError"))
    },
  })

  const removeRecoveryEmailMutation = trpc.auth.removeRecoveryEmail.useMutation({
    onSuccess: () => {
      toast.success(t("profile.recoveryEmail.removeSuccess"))
      refetchRecoveryEmail()
      onUpdate?.()
    },
    onError: (error) => {
      showErrorFromException(error, t("profile.recoveryEmail.removeError"))
    },
  })

  const setSecurityQuestionsMutation = trpc.auth.setSecurityQuestions.useMutation({
    onSuccess: () => {
      toast.success(t("profile.securityQuestions.setSuccess"))
      setIsSecurityQuestionsDialogOpen(false)
      setSecurityQuestions([])
      refetchSecurityQuestions()
      onUpdate?.()
    },
    onError: (error) => {
      showErrorFromException(error, t("profile.securityQuestions.setError"))
    },
  })

  const handleAddSecurityQuestion = () => {
    setSecurityQuestions([...securityQuestions, { question: "", answer: "" }])
  }

  const handleRemoveSecurityQuestion = (index: number) => {
    setSecurityQuestions(securityQuestions.filter((_, i) => i !== index))
  }

  const handleSecurityQuestionChange = (index: number, field: "question" | "answer", value: string) => {
    const updated = [...securityQuestions]
    updated[index] = { ...updated[index], [field]: value }
    setSecurityQuestions(updated)
  }

  const handleSetRecoveryEmail = () => {
    if (!recoveryEmail) {
      toast.error(t("profile.recoveryEmail.emailRequired"))
      return
    }
    setRecoveryEmailMutation.mutate({ email: recoveryEmail })
  }

  const handleSetSecurityQuestions = () => {
    if (securityQuestions.length < 2) {
      toast.error(t("profile.securityQuestions.minRequired"))
      return
    }
    if (securityQuestions.some((q) => !q.question || !q.answer)) {
      toast.error(t("profile.securityQuestions.allFieldsRequired"))
      return
    }
    setSecurityQuestionsMutation.mutate({ questions: securityQuestions })
  }

  return (
    <div className="space-y-6">
      {/* Recovery Email Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {t("profile.recoveryEmail.title")}
          </CardTitle>
          <CardDescription>{t("profile.recoveryEmail.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {recoveryEmailData?.recoveryEmail ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{recoveryEmailData.recoveryEmail}</p>
                    {recoveryEmailData.verified ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {t("auth.emailVerification.verified")}
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {t("auth.emailVerification.unverified")}
                      </Badge>
                    )}
                  </div>
                  {!recoveryEmailData.verified && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("profile.recoveryEmail.verificationRequired")}
                    </p>
                  )}
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => removeRecoveryEmailMutation.mutate()}
                  disabled={removeRecoveryEmailMutation.isPending}
                >
                  {removeRecoveryEmailMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{t("profile.recoveryEmail.notSet")}</AlertDescription>
            </Alert>
          )}

          <Dialog open={isRecoveryEmailDialogOpen} onOpenChange={setIsRecoveryEmailDialogOpen}>
            <DialogTrigger asChild>
              <Button variant={recoveryEmailData?.recoveryEmail ? "outline" : "default"}>
                {recoveryEmailData?.recoveryEmail ? (
                  t("profile.recoveryEmail.update")
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    {t("profile.recoveryEmail.set")}
                  </>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("profile.recoveryEmail.setTitle")}</DialogTitle>
                <DialogDescription>{t("profile.recoveryEmail.setDescription")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="recovery-email">{t("auth.email")}</Label>
                  <Input
                    id="recovery-email"
                    type="email"
                    placeholder={t("auth.emailPlaceholder")}
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    disabled={setRecoveryEmailMutation.isPending}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsRecoveryEmailDialogOpen(false)}
                  disabled={setRecoveryEmailMutation.isPending}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={handleSetRecoveryEmail}
                  disabled={setRecoveryEmailMutation.isPending || !recoveryEmail}
                >
                  {setRecoveryEmailMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("common.loading")}
                    </>
                  ) : (
                    t("common.save")
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Separator />

      {/* Security Questions Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("profile.securityQuestions.title")}
          </CardTitle>
          <CardDescription>{t("profile.securityQuestions.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {securityQuestionsData?.questions && securityQuestionsData.questions.length > 0 ? (
            <div className="space-y-4">
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  {t("profile.securityQuestions.configured", {
                    count: securityQuestionsData.questions.length,
                  })}
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                {securityQuestionsData.questions.map((q, index) => (
                  <div key={q.id} className="rounded-lg border p-3">
                    <p className="text-sm font-medium">{q.question}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{t("profile.securityQuestions.notSet")}</AlertDescription>
            </Alert>
          )}

          <Dialog open={isSecurityQuestionsDialogOpen} onOpenChange={setIsSecurityQuestionsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant={securityQuestionsData?.questions && securityQuestionsData.questions.length > 0 ? "outline" : "default"}>
                {securityQuestionsData?.questions && securityQuestionsData.questions.length > 0 ? (
                  t("profile.securityQuestions.update")
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    {t("profile.securityQuestions.set")}
                  </>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("profile.securityQuestions.setTitle")}</DialogTitle>
                <DialogDescription>{t("profile.securityQuestions.setDescription")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {securityQuestions.map((sq, index) => (
                  <div key={index} className="space-y-2 rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <Label>{t("profile.securityQuestions.question")} {index + 1}</Label>
                      {securityQuestions.length > 2 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveSecurityQuestion(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <Select
                      value={sq.question}
                      onValueChange={(value) => handleSecurityQuestionChange(index, "question", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("profile.securityQuestions.selectQuestion")} />
                      </SelectTrigger>
                      <SelectContent>
                        {SECURITY_QUESTIONS.map((q) => (
                          <SelectItem key={q} value={q}>
                            {q}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="space-y-2">
                      <Label>{t("profile.securityQuestions.answer")}</Label>
                      <Input
                        type="text"
                        placeholder={t("profile.securityQuestions.answerPlaceholder")}
                        value={sq.answer}
                        onChange={(e) => handleSecurityQuestionChange(index, "answer", e.target.value)}
                      />
                    </div>
                  </div>
                ))}
                {securityQuestions.length < 5 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddSecurityQuestion}
                    className="w-full"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {t("profile.securityQuestions.addQuestion")}
                  </Button>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsSecurityQuestionsDialogOpen(false)
                    setSecurityQuestions([])
                  }}
                  disabled={setSecurityQuestionsMutation.isPending}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={handleSetSecurityQuestions}
                  disabled={
                    setSecurityQuestionsMutation.isPending ||
                    securityQuestions.length < 2 ||
                    securityQuestions.some((q) => !q.question || !q.answer)
                  }
                >
                  {setSecurityQuestionsMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("common.loading")}
                    </>
                  ) : (
                    t("common.save")
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  )
}
