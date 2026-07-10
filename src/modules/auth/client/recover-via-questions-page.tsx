"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { AuthCard } from "./auth-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { HelpCircle, Loader2, ArrowLeft, Mail } from "lucide-react"
import Link from "next/link"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Info } from "lucide-react"
import { useRouter } from "next/navigation"
import { showErrorFromException } from "@/lib/error-toast"

const emailSchema = z.object({
  email: z.string().email("Invalid email address"),
})

const answersSchema = z.object({
  email: z.string().email(),
  answers: z.array(
    z.object({
      question: z.string(),
      answer: z.string().min(1, "Answer is required"),
    })
  ),
})

type EmailFormValues = z.infer<typeof emailSchema>
type AnswersFormValues = z.infer<typeof answersSchema>

export function RecoverViaQuestionsPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [step, setStep] = React.useState<"email" | "questions">("email")
  const [email, setEmail] = React.useState("")
  const [questions, setQuestions] = React.useState<Array<{ id: string; question: string }>>([])

  const emailForm = useForm<EmailFormValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: {
      email: "",
    },
  })

  const answersForm = useForm<AnswersFormValues>({
    resolver: zodResolver(answersSchema),
    defaultValues: {
      email: "",
      answers: [],
    },
  })

  const getQuestionsMutation = trpc.auth.getUserSecurityQuestionsForRecovery.useMutation({
    onSuccess: (data) => {
      if (!data.questions || data.questions.length === 0) {
        toast.error(t("auth.securityQuestions.noQuestionsSet"))
        return
      }
      setQuestions(data.questions)
      setStep("questions")
      // Initialize answers form with questions
      answersForm.setValue("email", email)
      answersForm.setValue(
        "answers",
        data.questions.map((q) => ({ question: q.question, answer: "" }))
      )
    },
    onError: (error) => {
      showErrorFromException(error, t("auth.securityQuestions.fetchError"))
    },
  })

  const verifyAnswersMutation = trpc.auth.verifySecurityQuestions.useMutation({
    onSuccess: (data) => {
      if (data.success && data.resetToken) {
        toast.success(t("auth.securityQuestions.verificationSuccess"))
        // Carry the single-use reset token (not a userId) to the reset step.
        router.push(`/reset-password-via-questions?token=${encodeURIComponent(data.resetToken)}`)
      }
    },
    onError: (error) => {
      showErrorFromException(error, t("auth.securityQuestions.verificationFailed"))
    },
  })

  const onEmailSubmit = (values: EmailFormValues) => {
    setEmail(values.email)
    getQuestionsMutation.mutate({ email: values.email })
  }

  const onAnswersSubmit = (values: AnswersFormValues) => {
    verifyAnswersMutation.mutate({
      email: values.email,
      answers: values.answers,
    })
  }

  if (step === "email") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-background via-background to-muted p-4">
        <AuthCard className="w-full">
          <div className="space-y-6 px-5">
            <div>
              <h1 className="text-2xl font-bold">{t("auth.securityQuestions.recoveryTitle")}</h1>
              <p className="mt-2 text-muted-foreground">
                {t("auth.securityQuestions.recoveryDescription")}
              </p>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                {t("auth.securityQuestions.recoveryInfo")}
              </AlertDescription>
            </Alert>

            <Form {...emailForm}>
              <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
                <FormField
                  control={emailForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("auth.email")}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input
                            {...field}
                            type="email"
                            placeholder={t("auth.emailPlaceholder")}
                            className="pl-10"
                            disabled={getQuestionsMutation.isPending}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={getQuestionsMutation.isPending}
                >
                  {getQuestionsMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("common.loading")}
                    </>
                  ) : (
                    <>
                      <HelpCircle className="mr-2 h-4 w-4" />
                      {t("auth.securityQuestions.getQuestions")}
                    </>
                  )}
                </Button>
              </form>
            </Form>

            <div className="text-center text-sm space-y-2">
              <Link href="/forgot-password" className="text-primary hover:underline block">
                <ArrowLeft className="mr-1 inline h-3 w-3" />
                {t("auth.securityQuestions.backToEmailReset")}
              </Link>
              <Link href="/login" className="text-muted-foreground hover:underline block">
                {t("auth.backToLogin")}
              </Link>
            </div>
          </div>
        </AuthCard>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-background via-background to-muted p-4">
      <AuthCard className="w-full max-w-2xl">
        <div className="space-y-6 px-5">
          <div>
            <h1 className="text-2xl font-bold">{t("auth.securityQuestions.answerQuestions")}</h1>
            <p className="mt-2 text-muted-foreground">
              {t("auth.securityQuestions.answerQuestionsDescription")}
            </p>
          </div>

          <Alert>
            <HelpCircle className="h-4 w-4" />
            <AlertDescription>
              {t("auth.securityQuestions.answerAccurately")}
            </AlertDescription>
          </Alert>

          <Form {...answersForm}>
            <form onSubmit={answersForm.handleSubmit(onAnswersSubmit)} className="space-y-6">
              {questions.map((question, index) => (
                <FormField
                  key={question.id}
                  control={answersForm.control}
                  name={`answers.${index}.answer`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">
                        {index + 1}. {question.question}
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          placeholder={t("auth.securityQuestions.yourAnswer")}
                          disabled={verifyAnswersMutation.isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}

              <Button
                type="submit"
                className="w-full"
                disabled={verifyAnswersMutation.isPending}
              >
                {verifyAnswersMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("common.loading")}
                  </>
                ) : (
                  t("auth.securityQuestions.verifyAnswers")
                )}
              </Button>
            </form>
          </Form>

          <div className="text-center text-sm space-y-2">
            <button
              onClick={() => {
                setStep("email")
                setQuestions([])
                emailForm.reset()
              }}
              className="text-primary hover:underline block w-full"
            >
              <ArrowLeft className="mr-1 inline h-3 w-3" />
              {t("auth.securityQuestions.tryDifferentEmail")}
            </button>
            <Link href="/login" className="text-muted-foreground hover:underline block">
              {t("auth.backToLogin")}
            </Link>
          </div>
        </div>
      </AuthCard>
    </div>
  )
}

