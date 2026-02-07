"use client"

import { Calendar, Tag, Sparkles, Bug, Shield, Wrench } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useTranslation } from "@/hooks/use-translation"

interface ChangelogClientProps {
  translations: Record<string, unknown>
  language: "en" | "bn"
}

export function ChangelogClient({ translations, language }: ChangelogClientProps) {
  const { t } = useTranslation()

  // Get changelog entries from translations
  const entries = t("changelog.entries", { returnObjects: true }) as Array<{date: string; title: string; type: string}>

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "feature":
        return <Sparkles className="h-4 w-4" />
      case "fix":
        return <Bug className="h-4 w-4" />
      case "security":
        return <Shield className="h-4 w-4" />
      case "improvement":
        return <Wrench className="h-4 w-4" />
      default:
        return <Tag className="h-4 w-4" />
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "feature":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20"
      case "fix":
        return "bg-green-500/10 text-green-600 border-green-500/20"
      case "security":
        return "bg-red-500/10 text-red-600 border-red-500/20"
      case "improvement":
        return "bg-purple-500/10 text-purple-600 border-purple-500/20"
      default:
        return "bg-gray-500/10 text-gray-600 border-gray-500/20"
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="py-20 px-4 bg-linear-to-br from-primary/5 via-background to-muted/20">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">{translations.title}</h1>
          <p className="text-xl text-muted-foreground mb-8">{translations.subtitle}</p>
        </div>
      </section>

      {/* Changelog Entries */}
      <section className="py-12 px-4">
        <div className="max-w-4xl mx-auto space-y-8">
          {entries && Array.isArray(entries) && entries.map((entry: Record<string, unknown>, index: number) => (
            <Card key={index} className="relative">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Badge variant="outline" className="font-mono">
                        {entry.version}
                      </Badge>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>{entry.date}</span>
                      </div>
                    </div>
                    {entry.title && (
                      <CardTitle className="text-2xl mb-2">{entry.title}</CardTitle>
                    )}
                    {entry.description && (
                      <CardDescription className="text-base">{entry.description}</CardDescription>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {entry.changes && Object.entries(entry.changes as Record<string, Record<string, unknown>[]>).map(([type, items]: [string, Record<string, unknown>[]]) => (
                    <div key={type} className="space-y-2">
                      <div className="flex items-center gap-2 mb-2">
                        {getTypeIcon(type)}
                        <span className="font-semibold text-sm uppercase tracking-wide">
                          {translations.types[type] || type}
                        </span>
                      </div>
                      {Array.isArray(items) && items.length > 0 && (
                        <ul className="space-y-1.5 ml-6">
                          {items.map((item: string, itemIndex: number) => (
                            <li key={itemIndex} className="flex items-start gap-2 text-muted-foreground">
                              <span className="text-primary mt-1.5">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}

