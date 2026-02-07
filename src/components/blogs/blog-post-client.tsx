"use client"

import Link from "next/link"
import { Calendar, Clock, ArrowLeft, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { BlogContent } from "./blog-content"

interface BlogPostClientProps {
  slug: string
  translations: Record<string, unknown>
  language: "en" | "bn"
}

export function BlogPostClient({ slug, translations, language }: BlogPostClientProps) {
  const postMap: Record<string, Record<string, unknown>> = {
    "core-features": translations.posts.coreFeatures,
    "advanced-search": translations.posts.advancedSearch,
    "security": translations.posts.security,
    "team-management": translations.posts.teamManagement,
    "complete-overview": translations.posts.completeOverview,
  }

  const post = postMap[slug]
  if (!post) {
    return <div>Post not found</div>
  }

  const allPosts = [
    { slug: "core-features", title: translations.posts.coreFeatures.title },
    { slug: "advanced-search", title: translations.posts.advancedSearch.title },
    { slug: "security", title: translations.posts.security.title },
    { slug: "team-management", title: translations.posts.teamManagement.title },
    { slug: "complete-overview", title: translations.posts.completeOverview.title },
  ]

  const currentIndex = allPosts.findIndex((p) => p.slug === slug)
  const prevPost = currentIndex > 0 ? allPosts[currentIndex - 1] : null
  const nextPost = currentIndex < allPosts.length - 1 ? allPosts[currentIndex + 1] : null

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="py-20 px-4 bg-linear-to-br from-primary/5 via-background to-muted/20">
        <div className="max-w-4xl mx-auto">
          <Button asChild variant="ghost" className="mb-6">
            <Link href="/blogs">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {translations.backToBlog}
            </Link>
          </Button>
          <div className="flex items-center gap-2 mb-4">
            <Badge variant="secondary">{post.category}</Badge>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-6">{post.title}</h1>
          <p className="text-xl text-muted-foreground mb-8">{post.description}</p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>{post.date}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{post.readTime}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Blog Content */}
      <section className="py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <article className="prose prose-lg dark:prose-invert max-w-none">
            <BlogContent slug={slug} language={language} />
          </article>

          <Separator className="my-12" />

          {/* Navigation */}
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            {prevPost ? (
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href={`/blogs/${prevPost.slug}`}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {prevPost.title}
                </Link>
              </Button>
            ) : (
              <div />
            )}
            {nextPost ? (
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href={`/blogs/${nextPost.slug}`}>
                  {nextPost.title}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <div />
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
