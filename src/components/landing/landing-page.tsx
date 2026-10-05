"use client"

import "./landing.css"
import { LandingHeader } from "./landing-header"
import { HeroSection } from "./hero-section"
import { FeaturesSection } from "./features-section"
import { SecuritySection } from "./security-section"
import { PWASection } from "./pwa-section"
import { AppPreviewSection } from "./app-preview-section"
import { TestimonialsSection } from "./testimonials-section"
import { CTASection } from "./cta-section"
import { Footer } from "./footer"

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />
      <HeroSection />
      <AppPreviewSection />
      <FeaturesSection />
      <SecuritySection />
      <TestimonialsSection />
      <PWASection />
      <CTASection />
      <Footer />
    </div>
  )
}
