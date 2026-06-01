"use client"

import * as React from "react"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { AppSidebar } from "@/components/shared/sidebar"
import { Logo } from "@/components/shared/logo"
import { cn } from "@/lib/utils"
import { OnboardingProvider } from "@/modules/onboarding/client"
import { CommandPaletteProvider } from "@/modules/quick-actions/client"
import { useCurrentUser } from "@/hooks/use-current-user"
import { usePathname } from "next/navigation"
import { PageTransition } from "@/components/motion"

export function AdminLayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  const [isCollapsed, setIsCollapsed] = React.useState(false)
  const pathname = usePathname()

  // Use the prefetched user data from the server
  const { user, isLoading } = useCurrentUser()

  // Prevent body scrolling when in admin layout
  React.useEffect(() => {
    document.body.style.overflow = "hidden"
    document.documentElement.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
      document.documentElement.style.overflow = ""
    }
  }, [])

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed)
  }

  // Show nothing while loading (this should be instant with SSR prefetching)
  if (isLoading || !user) {
    return null
  }

  return (
    <CommandPaletteProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Desktop Sidebar */}
        <aside
          className={cn(
            "hidden border-r bg-card lg:block transition-all duration-300 ease-in-out",
            isCollapsed ? "w-16" : "w-64"
          )}
        >
          <AppSidebar 
            user={{
              id: user.id,
              name: user.name,
              email: user.email,
              image: user.image,
              role: user.role,
            }} 
            isCollapsed={isCollapsed} 
            onToggleCollapse={toggleCollapse} 
          />
        </aside>

        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Mobile Header */}
          <header className="flex h-16 items-center justify-between border-b px-4 lg:hidden">
            <div className="flex items-center gap-2">
              <Logo className="h-8 w-8" />
              <span className="text-xl font-bold">PassBangla</span>
            </div>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <AppSidebar 
                  user={{
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    image: user.image,
                    role: user.role,
                  }} 
                  isCollapsed={false} 
                  onToggleCollapse={() => {}} 
                />
              </SheetContent>
            </Sheet>
          </header>

          {/* Page Content */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <OnboardingProvider>
              <PageTransition key={pathname}>{children}</PageTransition>
            </OnboardingProvider>
          </main>
        </div>
      </div>
    </CommandPaletteProvider>
  )
}
