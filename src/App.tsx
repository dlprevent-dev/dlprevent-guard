import { ClerkProvider, SignedIn, SignedOut, RedirectToSignIn } from "@clerk/clerk-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/error-boundary";
import { CLERK_PUBLISHABLE_KEY } from "@/lib/clerk";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";
import DashboardLayout from "./pages/dashboard/DashboardLayout";
import Overview from "./pages/dashboard/Overview";
import Keys from "./pages/dashboard/Keys";
import Connect from "./pages/dashboard/Connect";
import Endpoints from "./pages/dashboard/Endpoints";
import Providers from "./pages/dashboard/Providers";
import Routes_ from "./pages/dashboard/Routes";
import Policies from "./pages/dashboard/Policies";
import Logs from "./pages/dashboard/Logs";
import Threats from "./pages/dashboard/Threats";
import Alerts from "./pages/dashboard/Alerts";
import Playground from "./pages/dashboard/Playground";
import PolicySandbox from "./pages/dashboard/PolicySandbox";
import PolicyHarness from "./pages/dashboard/PolicyHarness";
import SignInPage from "./pages/SignIn";
import SignUpPage from "./pages/SignUp";
import DocsLayout from "./pages/docs/DocsLayout";
import DocsOverview from "./pages/docs/Overview";
import DocsQuickstart from "./pages/docs/Quickstart";
import DocsConcepts from "./pages/docs/Concepts";
import DocsApiKeys from "./pages/docs/ApiKeys";
import DocsEndpoints from "./pages/docs/Endpoints";
import DocsRoutes from "./pages/docs/Routes";
import DocsPolicies from "./pages/docs/Policies";
import DocsLogs from "./pages/docs/Logs";
import DocsProxyApi from "./pages/docs/ProxyApi";
import DocsErrors from "./pages/docs/Errors";
import DocsFaq from "./pages/docs/Faq";

const queryClient = new QueryClient();

const Protected = ({ children }: { children: React.ReactNode }) => (
  <>
    <SignedIn>{children}</SignedIn>
    <SignedOut><RedirectToSignIn /></SignedOut>
  </>
);

const App = () => (
  <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/sign-in/*" element={<SignInPage />} />
            <Route path="/sign-up/*" element={<SignUpPage />} />
            <Route path="/dashboard" element={<Protected><ErrorBoundary><DashboardLayout /></ErrorBoundary></Protected>}>
              <Route index element={<Overview />} />
              <Route path="keys" element={<Keys />} />
              <Route path="endpoints" element={<Endpoints />} />
              <Route path="providers" element={<Providers />} />
              <Route path="routes" element={<Routes_ />} />
              <Route path="policies" element={<Policies />} />
              <Route path="policies/sandbox" element={<PolicySandbox />} />
              <Route path="policies/harness" element={<PolicyHarness />} />
              <Route path="logs" element={<Logs />} />
              <Route path="threats" element={<Threats />} />
              <Route path="alerts" element={<Alerts />} />
              <Route path="playground" element={<Playground />} />
            </Route>
            <Route path="/docs" element={<DocsLayout />}>
              <Route index element={<DocsOverview />} />
              <Route path="quickstart" element={<DocsQuickstart />} />
              <Route path="concepts" element={<DocsConcepts />} />
              <Route path="api-keys" element={<DocsApiKeys />} />
              <Route path="endpoints" element={<DocsEndpoints />} />
              <Route path="routes" element={<DocsRoutes />} />
              <Route path="policies" element={<DocsPolicies />} />
              <Route path="logs" element={<DocsLogs />} />
              <Route path="proxy-api" element={<DocsProxyApi />} />
              <Route path="errors" element={<DocsErrors />} />
              <Route path="faq" element={<DocsFaq />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ClerkProvider>
);

export default App;
