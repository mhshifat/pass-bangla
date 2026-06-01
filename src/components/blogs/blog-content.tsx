"use client"

import { useTranslation } from "@/hooks/use-translation"

interface BlogContentProps {
  slug: string
  language: "en" | "bn"
}

interface BlogSection {
  title?: string
  subtitle?: string
  paragraphs?: string[]
  list?: string[]
}

interface BlogStructuredContent {
  sections?: BlogSection[]
}

// Convert slug to camelCase (e.g., "core-features" -> "coreFeatures")
function slugToCamelCase(slug: string): string {
  return slug
    .split('-')
    .map((word, index) => 
      index === 0 
        ? word.toLowerCase() 
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join('')
}

export function BlogContent({ slug, language }: BlogContentProps) {
  const { t } = useTranslation()

  const camelCaseSlug = slugToCamelCase(slug)
  const contentKey = `blog.posts.${camelCaseSlug}.content`

  // Get the content from translations
  const content = t(contentKey, { returnObjects: true }) as unknown as
    | string
    | BlogStructuredContent

  if (typeof content === "string") {
    // If it's a simple string, render it
    return <div dangerouslySetInnerHTML={{ __html: content }} />
  }

  // If it's an object with sections, render structured content
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return (
      <div className="space-y-8">
        {content.sections?.map((section, index) => (
          <div key={index} className="space-y-4">
            {section.title && (
              <h2 className="text-3xl font-bold mt-8 mb-4">{section.title}</h2>
            )}
            {section.subtitle && (
              <h3 className="text-2xl font-semibold mt-6 mb-3">{section.subtitle}</h3>
            )}
            {section.paragraphs?.map((paragraph: string, pIndex: number) => (
              <p key={pIndex} className="text-lg leading-relaxed text-muted-foreground mb-4">
                {paragraph}
              </p>
            ))}
            {section.list && (
              <ul className="list-disc list-inside space-y-2 text-lg text-muted-foreground ml-4">
                {section.list.map((item: string, iIndex: number) => (
                  <li key={iIndex}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    )
  }

  // Fallback: try to get raw content
  const rawContent = t(contentKey)
  return <div className="prose prose-lg dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: rawContent }} />
}

