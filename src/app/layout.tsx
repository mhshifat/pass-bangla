import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Hind_Siliguri } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { TRPCReactProvider } from "@/trpc/client";
import { Toaster } from "@/components/ui/sonner";
import { NavigationProgress } from "@/components/providers/navigation-progress";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ThemeInitializer } from "@/components/providers/theme-initializer";
import { I18nProvider } from "@/components/providers/i18n-provider";
import { AccessibilityProvider } from "@/components/providers/accessibility-provider";
import { MotionProvider } from "@/components/motion";
import { AccessibilityInitializer } from "@/components/providers/accessibility-initializer";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import { OrganizationStructuredData, WebSiteStructuredData, SoftwareApplicationStructuredData } from "@/components/seo/structured-data";
import { getServerLanguage } from "@/lib/i18n-server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const hindSiliguri = Hind_Siliguri({
  variable: "--font-hind-siliguri",
  subsets: ["latin", "bengali"],
  weight: ["300", "400", "500", "600", "700"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://passbangla.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "PassBangla - Secure Password Manager",
    template: "%s | PassBangla",
  },
  description: "Enterprise password management solution with client-side encryption. Secure, fast, and beautifully designed password manager for teams and individuals.",
  keywords: [
    "password manager",
    "enterprise password management",
    "secure password storage",
    "client-side encryption",
    "zero-knowledge architecture",
    "team password sharing",
    "password security",
    "cybersecurity",
    "password vault",
    "secure credentials",
  ],
  authors: [{ name: "PassBangla Team" }],
  creator: "PassBangla",
  publisher: "PassBangla",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "PassBangla",
    title: "PassBangla - Secure Password Manager",
    description: "Enterprise password management solution with client-side encryption. Secure, fast, and beautifully designed.",
    images: [
      {
        url: `${siteUrl}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "PassBangla - Secure Password Manager",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PassBangla - Secure Password Manager",
    description: "Enterprise password management solution with client-side encryption.",
    images: [`${siteUrl}/opengraph-image`],
    creator: "@passbangla",
  },
  alternates: {
    canonical: siteUrl,
    languages: {
      "en-US": `${siteUrl}/en`,
      "bn-BD": `${siteUrl}/bn`,
    },
  },
  category: "Security",
  classification: "Password Management Software",
  manifest: "/manifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PassBangla",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/android-icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon-57x57.png", sizes: "57x57", type: "image/png" },
      { url: "/apple-icon-60x60.png", sizes: "60x60", type: "image/png" },
      { url: "/apple-icon-72x72.png", sizes: "72x72", type: "image/png" },
      { url: "/apple-icon-76x76.png", sizes: "76x76", type: "image/png" },
      { url: "/apple-icon-114x114.png", sizes: "114x114", type: "image/png" },
      { url: "/apple-icon-120x120.png", sizes: "120x120", type: "image/png" },
      { url: "/apple-icon-144x144.png", sizes: "144x144", type: "image/png" },
      { url: "/apple-icon-152x152.png", sizes: "152x152", type: "image/png" },
      { url: "/apple-icon-180x180.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION,
    yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFICATION,
    yahoo: process.env.NEXT_PUBLIC_YAHOO_VERIFICATION,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Get language from cookies for SSR
  const language = await getServerLanguage()
  
  return (
    <html lang={language} suppressHydrationWarning>
      <head>
        <meta name="msvalidate.01" content="6FDB602163A60B7F0ABA4A29B9153BC2" />
        <meta name="yandex-verification" content="f179c8429f117666" />
        <meta name="msapplication-TileColor" content="#ffffff" />
        <meta name="msapplication-TileImage" content="/ms-icon-144x144.png" />
        <meta name="theme-color" content="#ffffff" />
        {/* Critical: Initialize i18n language synchronously before React hydrates */}
        {/* Language default: English for all users. Language selection only available after login. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // Default to English. Language selection only available after login via sidebar or settings.
                // Priority: cookie (user's explicit choice after login) > default to 'en'
                var lang = 'en';
                
                // Only check cookie - this is only set when user explicitly changes language after login
                var cookieMatch = document.cookie.match(/i18nextLng=([^;]+)/);
                if (cookieMatch && (cookieMatch[1] === 'en' || cookieMatch[1] === 'bn')) {
                  lang = cookieMatch[1];
                }
                
                // Set initial language for i18n initialization
                window.__I18N_INITIAL_LANGUAGE__ = lang;
                
                // Only set cookie if it doesn't already exist (preserves user's explicit choice)
                if (!cookieMatch) {
                  var expires = new Date();
                  expires.setFullYear(expires.getFullYear() + 1);
                  document.cookie = 'i18nextLng=' + lang + '; path=/; expires=' + expires.toUTCString() + '; SameSite=Lax';
                }
                
                // Sync localStorage with cookie
                try {
                  if (cookieMatch) {
                    localStorage.setItem('i18nextLng', lang);
                  }
                } catch (e) {
                  // Ignore localStorage errors
                }
              })();
            `,
          }}
        />
        <OrganizationStructuredData />
        <WebSiteStructuredData />
        <SoftwareApplicationStructuredData />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${hindSiliguri.variable} antialiased ${language === "bn" ? "font-bengali" : ""}`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AccessibilityProvider>
          <I18nProvider>
            <TRPCReactProvider>
              <ThemeInitializer />
                <AccessibilityInitializer />
              <Suspense fallback={null}>
                <NavigationProgress showFullPageLoader={false} />
              </Suspense>
              <MotionProvider>{children}</MotionProvider>
            </TRPCReactProvider>
            <Toaster />
            <ServiceWorkerRegistration />
            <InstallPrompt />
          </I18nProvider>
          </AccessibilityProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
