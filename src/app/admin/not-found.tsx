import Link from "next/link"
import { FileQuestion, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { BackButton } from "../not-found-back-button"

export default function NotFound() {
  return (
    <div className={cn("min-h-screen flex items-center justify-center px-4 relative overflow-hidden")}>
      {/* Modern gradient background - matching auth pages */}
      <div className="absolute inset-0 bg-linear-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-background dark:via-background dark:to-muted/20" />
      
      {/* Animated background pattern */}
      <div className="absolute inset-0 opacity-[0.04] dark:opacity-[0.05]">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: '24px 24px',
        }} />
      </div>

      {/* Decorative gradient orbs */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-blue-200/40 dark:bg-primary/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-200/40 dark:bg-primary/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

      {/* Card with backdrop blur */}
      <Card className="w-full max-w-lg relative z-10 backdrop-blur-sm bg-card/95 border-border/50 shadow-xl">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <div className="rounded-full bg-muted p-6">
              <FileQuestion className="h-16 w-16 text-muted-foreground" />
            </div>
          </div>
          <div className="space-y-2">
            <CardTitle className="text-4xl font-bold">404</CardTitle>
            <CardTitle className="text-2xl">Page Not Found</CardTitle>
            <CardDescription className="text-base">
              Admin routes are only accessible on subdomains.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center text-sm text-muted-foreground">
            <p>Please access this page from your company subdomain (e.g., <code className="bg-muted px-1 rounded">company.localhost:3000/admin</code>).</p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild variant="default" size="lg">
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              Go Home
            </Link>
          </Button>
          <BackButton />
        </CardFooter>
      </Card>
    </div>
  )
}

