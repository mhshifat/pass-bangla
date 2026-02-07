"use client"

import { useActionState, useState, useLayoutEffect } from "react"
import { Button } from "@/components/ui/button"
import { CardContent, CardFooter } from "@/components/ui/card"
import { LoginFormFields } from "./login-form-fields"
import { loginAction } from "@/app/(auth)/login/actions"
import { useTranslation } from "react-i18next"
import { PasskeyLoginButton } from "./passkey-login-button"
import { Separator } from "@/components/ui/separator"

interface LoginFormProps {
  isMainDomain: boolean
}

export function LoginForm({ isMainDomain }: LoginFormProps) {
  const { t } = useTranslation()
  const [state, formAction, isPending] = useActionState(loginAction, null);
  
  // Get base domain for register link (only on client side)
  // Registration should always happen on main domain, not subdomain
  const [registerUrl, setRegisterUrl] = useState("/register");
  
  useLayoutEffect(() => {
    // This must run in useLayoutEffect to set URL before browser paints
    // We need window.location which is only available on the client
    if (typeof window === "undefined") {
      return;
    }
    
    try {
      const origin = window.location.origin;
      if (!origin) {
        return;
      }
      
      const url = new URL(origin);
      const hostname = url.hostname;
      // Use window.location.port directly to ensure we get the port even if it's default
      const port = window.location.port || url.port;
      
      // Extract base domain by removing subdomain
      // For localhost: bevy.localhost:3000 -> localhost:3000
      // For production: subdomain.example.com -> example.com
      const parts = hostname.split(".");
      let baseHostname = hostname;
      
      if (hostname.includes("localhost")) {
        // For localhost, extract just "localhost" (remove subdomain)
        // bevy.localhost -> localhost
        // localhost -> localhost (no change)
        if (parts.length > 1) {
          baseHostname = "localhost";
        }
      } else {
        // For production domains, extract last two parts (domain.tld)
        // subdomain.example.com -> example.com
        if (parts.length > 2) {
          baseHostname = parts.slice(-2).join(".");
        }
      }
      
      // Construct absolute URL with protocol, hostname, port, and path
      // url.protocol already includes ":" (e.g., "http:"), so we just need "//"
      const protocol = url.protocol; // "http:" or "https:"
      const fullUrl = port 
        ? `${protocol}//${baseHostname}:${port}/register`
        : `${protocol}//${baseHostname}/register`;
      
      console.log("Computed register URL:", {
        origin,
        hostname,
        port,
        baseHostname,
        fullUrl,
        windowLocation: window.location.href,
        windowHostname: window.location.hostname,
        windowPort: window.location.port
      });
      
      // We need to set state here to update the href attribute
      // This is necessary because window.location is only available on the client
      // The linter warning about setState in effects is acceptable here as we need
      // to compute the URL on the client side to avoid hydration mismatches
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRegisterUrl(fullUrl);
    } catch (error) {
      console.error("Error constructing register URL:", error);
      // Keep default "/register" if URL parsing fails
    }
  }, []);

  return (
    <>
      <CardContent>
        <LoginFormFields
          formAction={formAction}
          isPending={isPending}
          state={state}
          isMainDomain={isMainDomain}
        />
      </CardContent>
      <CardFooter className="flex flex-col space-y-4">
        <Button type="submit" className="w-full" disabled={isPending} form="login-form">
          {isPending ? t("auth.signingIn") : t("auth.login")}
        </Button>
        
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <Separator />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              {t("auth.orContinueWith")}
            </span>
          </div>
        </div>

        <PasskeyLoginButton />
        
        <div className="text-sm text-center text-muted-foreground">
          {t("auth.dontHaveAccount")}{" "}
          <a 
            href={registerUrl}
            className="text-primary hover:underline font-medium"
          >
            {t("auth.register")}
          </a>
        </div>
      </CardFooter>
    </>
  )
}
