import { SignUp } from "@clerk/clerk-react";
import { Logo } from "@/components/Logo";
import { AuthShowcasePane } from "@/components/auth/AuthShowcasePane";
import { QuickstartHelpPanel } from "@/components/quickstart-help-panel";
import { Seo } from "@/components/seo";
import { clerkAppearance } from "@/lib/clerk-appearance";

const SignUpPage = () => (
  <div className="min-h-screen grid lg:grid-cols-[480px_1fr] bg-background">
    <Seo
      title="Create your account — AnveGuard"
      description="Sign up for AnveGuard. Free to start, no credit card required — a drop-in proxy for OpenAI-compatible AI requests."
      path="/sign-up"
    />
    <div className="flex flex-col px-8 py-10 lg:px-12 lg:py-14">
      <Logo />
      <div className="flex-1 flex flex-col justify-center max-w-sm w-full mt-10 lg:mt-0 mx-auto lg:mx-0">
        <h1 className="text-h1 font-semibold tracking-tight mb-1">Create your account</h1>
        <p className="text-body text-muted-foreground mb-7">Free to start. No credit card required.</p>
        <SignUp
          routing="path"
          path="/sign-up"
          signInUrl="/sign-in"
          forceRedirectUrl="/dashboard"
          appearance={clerkAppearance}
        />
        {/* Inline quickstart so new sign-ups see exactly what they'll do
            after creating the account, plus a copy-paste curl. */}
        <div className="mt-8">
          <QuickstartHelpPanel variant="compact" defaultOpen={false} />
        </div>
      </div>
    </div>
    <AuthShowcasePane />
  </div>
);

export default SignUpPage;
