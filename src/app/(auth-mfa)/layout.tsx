import { I18nProvider } from "@/components/providers/i18n-provider"
import { getServerLanguage } from "@/lib/i18n-server"
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function Layout({ children }: { children: React.ReactNode }) {
    const session = await getSession();

    if (!session?.isLoggedIn) {
        return redirect("/login");
    }
    const language = await getServerLanguage();

    return (
        <I18nProvider initialLanguage={language}>
        <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
            {/* Modern gradient background - more defined for light theme */}
            <div className="absolute inset-0 bg-linear-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-background dark:via-background dark:to-muted/20" />
            
            {/* Animated background pattern */}
            <div className="absolute inset-0 opacity-[0.04] dark:opacity-[0.05]">
                <div className="absolute inset-0" style={{
                    backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
                    backgroundSize: '24px 24px',
                }} />
            </div>

            {/* Decorative gradient orbs - more visible in light theme */}
            <div className="absolute top-0 left-0 w-96 h-96 bg-blue-200/40 dark:bg-primary/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-200/40 dark:bg-primary/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

            {/* Content */}
            <div className="relative z-10 w-full">
                {children}
            </div>
        </div>
        </I18nProvider>
    );
}