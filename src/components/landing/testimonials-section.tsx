"use client"

import { useRef } from "react"
import { Quote, Star } from "lucide-react"
import { useTranslation } from "@/hooks/use-translation"
import { useReveal } from "./use-reveal"

export function TestimonialsSection() {
  const { t } = useTranslation()
  const sectionRef = useRef<HTMLDivElement>(null)
  useReveal(sectionRef, "[data-testimonial-card]", 200)

  const testimonials = [
    {
      name: t("landing.testimonials.user1.name"),
      role: t("landing.testimonials.user1.role"),
      company: t("landing.testimonials.user1.company"),
      content: t("landing.testimonials.user1.content"),
      rating: 5,
    },
    {
      name: t("landing.testimonials.user2.name"),
      role: t("landing.testimonials.user2.role"),
      company: t("landing.testimonials.user2.company"),
      content: t("landing.testimonials.user2.content"),
      rating: 5,
    },
    {
      name: t("landing.testimonials.user3.name"),
      role: t("landing.testimonials.user3.role"),
      company: t("landing.testimonials.user3.company"),
      content: t("landing.testimonials.user3.content"),
      rating: 5,
    },
  ]

  return (
    <section
      ref={sectionRef}
      id="testimonials"
      className="py-24 px-4 bg-muted/30 relative overflow-hidden"
    >
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t("landing.testimonials.title")}
          </h2>
          <p className="text-lg text-muted-foreground">
            {t("landing.testimonials.subtitle")}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              data-testimonial-card
              className="bg-background p-6 rounded-lg border border-border shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-1 mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <Quote className="h-6 w-6 text-primary mb-4 opacity-50" />
              <p className="text-muted-foreground mb-6 italic">{testimonial.content}</p>
              <div>
                <p className="font-semibold">{testimonial.name}</p>
                <p className="text-sm text-muted-foreground">
                  {testimonial.role}, {testimonial.company}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
