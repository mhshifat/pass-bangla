import { I18nProvider } from "@/components/providers/i18n-provider"
import { getServerLanguage } from "@/lib/i18n-server"
import { getSession } from "@/lib/session";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

// Mark this route as dynamic since it uses cookies()
export const dynamic = 'force-dynamic'

export default async function Layout({ children }: { children: React.ReactNode }) {
    try {
        const session = await getSession();
        const headersList = await headers();
        const subdomain = headersList.get("x-subdomain");

        // Only redirect to /admin if user is logged in AND we're on a subdomain
        // On the main domain, /admin is not accessible, so allow access to /register
        // even if logged in (user might want to create a new account)
        if (session?.isLoggedIn === true && subdomain) {
            return redirect("/admin");
        }
        
        // If logged in on main domain, allow access to /register
        // (they might want to create a new account with different email)
    } catch (error) {
        if (isRedirectError(error)) {
            throw error;
        }
        
        // If session check fails (e.g., database timeout), 
        // allow the page to render anyway (graceful degradation)
        // The user can still attempt to login
        console.error("Session check failed in auth layout:", error);
    }

    const language = await getServerLanguage();

    return (
        <I18nProvider initialLanguage={language}>
            <div>
                {children}
            </div>
        </I18nProvider>
    );
}