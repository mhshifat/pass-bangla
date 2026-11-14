import type { Metadata } from "next"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Shield, Lock, Eye, Database, Users, FileText, Mail, Globe } from "lucide-react"
import Link from "next/link"

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://passbangla.com"

export const metadata: Metadata = {
  title: "Privacy Policy - PassBangla Browser Extension and Mobile App",
  description: "Learn how PassBangla Browser Extension collects, uses, stores, and protects your information. We are committed to protecting your privacy with zero-knowledge architecture.",
  keywords: [
    "privacy policy",
    "data protection",
    "GDPR compliance",
    "CCPA compliance",
    "browser extension privacy",
    "password manager privacy",
    "data security",
  ],
  openGraph: {
    title: "Privacy Policy - PassBangla Browser Extension and Mobile App",
    description: "Learn how PassBangla protects your privacy with zero-knowledge architecture and client-side encryption.",
    url: `${siteUrl}/privacy`,
    siteName: "PassBangla",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Privacy Policy - PassBangla Browser Extension and Mobile App",
    description: "Learn how PassBangla protects your privacy with zero-knowledge architecture.",
  },
  alternates: {
    canonical: `${siteUrl}/privacy`,
  },
}

const sections = [
  {
    icon: Globe,
    title: "PassBangla Mobile App",
    content: [
      {
        items: [
          "Sign-in: The app signs you in with the workspace, email and password you enter, and your two-step verification code if your account uses one. Accounts are created on the web, not in the app.",
          "Session: A session token is kept in the phone's secure storage (Android Keystore) so you stay signed in. Signing out removes it.",
          "Quick sign-in passphrase (optional): Your password is encrypted on the device with a passphrase you choose. The passphrase is never stored or sent anywhere.",
          "Biometric lock (optional): Fingerprint or face unlock is handled by the phone. PassBangla never receives your biometric data.",
          "Camera (optional): Used only when you scan an authenticator QR code. Images are not saved or sent.",
          "Clipboard: Values you copy are cleared automatically after the time you choose in Settings.",
          "Sharing: Sending a login to another app is always your choice, and it leaves PassBangla as plain text.",
          "No advertising, no analytics trackers, and no data sold or shared for marketing.",
          "Delete your data: Ask your workspace admin, or contact support@passbangla.com.",
        ],
      },
    ],
  },
  {
    icon: Shield,
    title: "Information We Collect",
    content: [
      {
        subtitle: "Information You Provide",
        items: [
          "Email Address: Required for account authentication and login",
          "Passwords: Stored locally and encrypted for password management functionality",
          "Company Subdomain: Used for multi-tenant account identification",
          "TOTP Secrets: Encrypted two-factor authentication secrets for TOTP code generation",
        ],
      },
      {
        subtitle: "Information Automatically Collected",
        items: [
          "Current Tab URL: Accessed only when you explicitly use the extension to match passwords with websites. This information is not stored or logged.",
          "Session Tokens: Temporary authentication tokens stored locally to maintain your login session",
        ],
      },
    ],
  },
  {
    icon: Lock,
    title: "How We Use Your Information",
    content: [
      {
        items: [
          "Password Management: To store, retrieve, and auto-fill your passwords",
          "Authentication: To verify your identity and maintain secure sessions",
          "TOTP Generation: To generate time-based one-time passwords for two-factor authentication",
          "Service Functionality: To provide core password management features",
        ],
      },
    ],
  },
  {
    icon: Database,
    title: "Data Storage and Security",
    content: [
      {
        items: [
          "Local Storage: All data is stored locally in your browser's extension storage",
          "Encryption: Passwords and sensitive data are encrypted before storage and transmission",
          "Server Sync: Data is synced with your PassBangla account (passbangla.com) over secure HTTPS connections",
          "No Third-Party Storage: We do not store your data with third-party services",
        ],
      },
    ],
  },
  {
    icon: Eye,
    title: "Information We Do NOT Collect",
    content: [
      {
        items: [
          "Browsing history or web pages you visit",
          "Personal communications (emails, texts, chats)",
          "Health information",
          "Financial or payment information",
          "GPS location or device location",
          "User activity tracking (clicks, mouse movements, keystrokes)",
          "Website content (text, images, videos from pages you visit)",
        ],
      },
    ],
  },
  {
    icon: Users,
    title: "Data Sharing and Disclosure",
    content: [
      {
        subtitle: "We do NOT:",
        items: [
          "Sell your data to third parties",
          "Share your data with advertisers or marketers",
          "Use your data for analytics or tracking",
          "Transfer your data for purposes unrelated to password management",
          "Use your data to determine creditworthiness or for lending purposes",
        ],
      },
      {
        subtitle: "We only:",
        items: [
          "Sync your data with your own PassBangla account (passbangla.com)",
          "Transmit data over secure HTTPS connections",
          "Store data locally in your browser",
        ],
      },
    ],
  },
  {
    icon: FileText,
    title: "Your Rights and Control",
    content: [
      {
        items: [
          "View Data: Access all stored passwords and data through the extension interface",
          "Delete Data: Log out of the extension to clear all locally stored data",
          "Choose What to Save: You decide which passwords to save to your vault",
          "Account Management: Manage your account settings at passbangla.com",
        ],
      },
    ],
  },
]

export default function PrivacyPolicyPage() {
  const lastUpdated = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="border-b bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 py-16">
          <div className="space-y-4 text-center">
            <div className="flex justify-center">
              <div className="rounded-full bg-primary/10 p-4">
                <Shield className="h-12 w-12 text-primary" />
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              Privacy Policy
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              PassBangla Browser Extension
            </p>
            <p className="text-sm text-muted-foreground">
              Last Updated: {lastUpdated}
            </p>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">
        {/* Introduction */}
        <Card>
          <CardHeader>
            <CardTitle>Introduction</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-slate dark:prose-invert max-w-none">
            <p>
              PassBangla (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy. This Privacy Policy explains how the PassBangla Browser Extension (&quot;Extension&quot;) collects, uses, stores, and protects your information.
            </p>
          </CardContent>
        </Card>

        {/* Main Sections */}
        {sections.map((section, index) => {
          const Icon = section.icon
          return (
            <Card key={index} className="overflow-hidden">
              <CardHeader className="bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-2xl">{section.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                {section.content.map((contentBlock, blockIndex) => (
                  <div key={blockIndex} className="space-y-3">
                    {"subtitle" in contentBlock && contentBlock.subtitle && (
                      <h3 className="text-lg font-semibold text-foreground">
                        {contentBlock.subtitle}
                      </h3>
                    )}
                    <ul className="space-y-2 list-none">
                      {contentBlock.items.map((item, itemIndex) => (
                        <li key={itemIndex} className="flex gap-3">
                          <span className="text-primary mt-1.5 shrink-0">•</span>
                          <span className="text-muted-foreground">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          )
        })}

        {/* Data Retention */}
        <Card>
          <CardHeader>
            <CardTitle>Data Retention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground">
              <strong className="text-foreground">Active Accounts:</strong> Data is retained while your account is active
            </p>
            <p className="text-muted-foreground">
              <strong className="text-foreground">Account Deletion:</strong> You can delete your account and all associated data at any time through your PassBangla account settings
            </p>
            <p className="text-muted-foreground">
              <strong className="text-foreground">Local Data:</strong> Local extension data is cleared when you log out
            </p>
          </CardContent>
        </Card>

        {/* Children's Privacy */}
        <Card>
          <CardHeader>
            <CardTitle>Children&apos;s Privacy</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Our Extension is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13.
            </p>
          </CardContent>
        </Card>

        {/* Changes to Policy */}
        <Card>
          <CardHeader>
            <CardTitle>Changes to This Privacy Policy</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the &quot;Last Updated&quot; date.
            </p>
          </CardContent>
        </Card>

        {/* Compliance */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-primary" />
              <CardTitle>Compliance</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              This Extension complies with:
            </p>
            <ul className="space-y-2 list-none">
              <li className="flex gap-3">
                <span className="text-primary mt-1.5 shrink-0">•</span>
                <span className="text-muted-foreground">Chrome Web Store Developer Program Policies</span>
              </li>
              <li className="flex gap-3">
                <span className="text-primary mt-1.5 shrink-0">•</span>
                <span className="text-muted-foreground">Firefox Add-on Policies</span>
              </li>
              <li className="flex gap-3">
                <span className="text-primary mt-1.5 shrink-0">•</span>
                <span className="text-muted-foreground">General Data Protection Regulation (GDPR) principles</span>
              </li>
              <li className="flex gap-3">
                <span className="text-primary mt-1.5 shrink-0">•</span>
                <span className="text-muted-foreground">California Consumer Privacy Act (CCPA) principles</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Contact */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-primary" />
              <CardTitle>Contact Us</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground">
              If you have questions about this Privacy Policy, please contact us at:
            </p>
            <div className="space-y-2">
              <p className="text-muted-foreground">
                <strong className="text-foreground">Website:</strong>{" "}
                <Link href={siteUrl} className="text-primary hover:underline">
                  {siteUrl}
                </Link>
              </p>
              <p className="text-muted-foreground">
                <strong className="text-foreground">Support:</strong>{" "}
                <Link href="mailto:shifat.dev@gmail.com" className="text-primary hover:underline">
                  shifat.dev@gmail.com
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Agreement */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              <strong className="text-foreground">By using the PassBangla Browser Extension, you agree to this Privacy Policy.</strong>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

