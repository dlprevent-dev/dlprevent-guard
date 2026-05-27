import type { Appearance } from "@clerk/types";

/**
 * Shared Clerk appearance for SignIn/SignUp.
 *
 * Themed against the AnveGuard dark operator console:
 *  - Transparent card (we provide the page chrome)
 *  - Surface-tone inputs with primary focus ring
 *  - Primary-filled CTA, no Clerk shadow/border
 *  - Compact social provider row
 *
 * Note on `footer: "hidden"`: Clerk's free-tier ToS technically require
 * keeping the "Secured by Clerk" badge; ensure your plan permits removal.
 */
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: "hsl(255 85% 66%)",
    colorBackground: "transparent",
    colorText: "hsl(210 20% 96%)",
    colorTextSecondary: "hsl(220 10% 62%)",
    colorInputBackground: "hsl(224 12% 14%)",
    colorInputText: "hsl(210 20% 96%)",
    colorDanger: "hsl(350 80% 62%)",
    colorSuccess: "hsl(152 60% 48%)",
    colorWarning: "hsl(38 92% 58%)",
    colorNeutral: "hsl(210 20% 96%)",
    borderRadius: "0.625rem",
    fontFamily: "inherit",
    fontSize: "14px",
  },
  elements: {
    rootBox: "w-full",
    card: "shadow-none border-none bg-transparent p-0",
    cardBox: "shadow-none border-none bg-transparent",
    header: "hidden",
    headerTitle: "hidden",
    headerSubtitle: "hidden",
    logoBox: "hidden",
    logoImage: "hidden",

    // Social buttons row — compact, surface-toned
    socialButtonsRoot: "gap-2",
    socialButtonsBlockButton:
      "border border-border bg-secondary hover:bg-surface-3 transition-colors rounded-md h-10 normal-case font-medium text-foreground",
    socialButtonsBlockButtonText: "text-sm font-medium text-foreground",
    socialButtonsProviderIcon: "h-4 w-4",

    dividerLine: "bg-border",
    dividerText: "text-meta uppercase tracking-wider text-muted-foreground font-mono",

    // Form
    formFieldLabel: "text-sm font-medium text-foreground",
    formFieldLabelRow: "mb-1.5",
    formFieldHintText: "text-xs text-muted-foreground",
    formFieldInput:
      "h-10 rounded-md border border-input bg-input text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/40 focus:ring-offset-0 transition-colors",
    formFieldInputShowPasswordButton: "text-muted-foreground hover:text-foreground",
    formFieldErrorText: "text-xs text-destructive mt-1",

    formButtonPrimary:
      "h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-md normal-case tracking-normal shadow-pop transition-colors after:hidden",
    formResendCodeLink: "text-primary hover:text-primary-glow",

    // Bottom "Already have an account?" row
    footer: "bg-transparent border-none shadow-none -mt-2",
    footerAction: "bg-transparent border-none",
    footerActionText: "text-sm text-muted-foreground",
    footerActionLink: "text-primary hover:text-primary-glow font-medium",

    // Identity preview (after entering email)
    identityPreview: "bg-secondary border border-border rounded-md",
    identityPreviewText: "text-sm text-foreground",
    identityPreviewEditButton: "text-primary hover:text-primary-glow",

    // OTP
    otpCodeFieldInput:
      "bg-input border border-input rounded-md text-foreground focus:border-primary focus:ring-2 focus:ring-primary/40",

    // Alerts
    alert: "rounded-md border border-border bg-surface-2 text-foreground",
    alertText: "text-sm text-foreground",
  },
  layout: {
    socialButtonsPlacement: "top",
    socialButtonsVariant: "iconButton",
    logoPlacement: "none",
    showOptionalFields: true,
  },
};
