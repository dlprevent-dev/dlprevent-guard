import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Topbar } from "@/components/topbar";
import { CommandPalette } from "@/components/command-palette";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { OnboardingWalkthrough } from "@/components/onboarding-walkthrough";
import { TourLauncher } from "@/components/tour-launcher";

const SIDEBAR_STORAGE_KEY = "dashboard:sidebar:open";
/** Default expanded state used both on first visit and after a reset. */
const SIDEBAR_DEFAULT_OPEN = true;
/** Custom event fired by UI affordances ("Reset sidebar layout") to clear
 *  the persisted sidebar state and restore the default expanded behavior. */
export const SIDEBAR_RESET_EVENT = "dashboard:sidebar:reset";
/** Must match the `md` breakpoint the shadcn Sidebar uses to swap between
 *  the desktop rail and the mobile sheet (see use-mobile.tsx). */
const MOBILE_BREAKPOINT = 768;

const isDesktopViewport = () =>
  typeof window !== "undefined" && window.innerWidth >= MOBILE_BREAKPOINT;

const readStoredOpen = (): boolean => {
  if (typeof window === "undefined") return SIDEBAR_DEFAULT_OPEN;
  try {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === null) return SIDEBAR_DEFAULT_OPEN;
    return stored !== "false";
  } catch {
    return SIDEBAR_DEFAULT_OPEN;
  }
};

const DashboardLayout = () => {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Hydrate from storage only when starting on a desktop viewport. On mobile
  // we always start expanded — the desktop rail is hidden and the mobile
  // sheet has its own open state (`openMobile` inside SidebarProvider).
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() =>
    isDesktopViewport() ? readStoredOpen() : SIDEBAR_DEFAULT_OPEN,
  );

  const handleSidebarOpenChange = (open: boolean) => {
    setSidebarOpen(open);
    // Persist toggles only on desktop. On mobile this `open` value drives the
    // hidden desktop rail and shouldn't pollute the user's saved layout.
    if (!isDesktopViewport()) return;
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open));
    } catch {
      // ignore storage failures (private mode, quota, etc.)
    }
  };

  // When the viewport crosses the mobile/desktop boundary, re-apply the
  // correct state: hydrate from storage on desktop, fall back to the default
  // on mobile so the next desktop reload still respects the saved value.
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(SIDEBAR_DEFAULT_OPEN);
    } else {
      setSidebarOpen(readStoredOpen());
    }
  }, [isMobile]);

  // Listen for "Reset sidebar layout" requests from anywhere in the dashboard.
  useEffect(() => {
    const onReset = () => {
      try {
        window.localStorage.removeItem(SIDEBAR_STORAGE_KEY);
      } catch {
        // ignore
      }
      setSidebarOpen(SIDEBAR_DEFAULT_OPEN);
    };
    window.addEventListener(SIDEBAR_RESET_EVENT, onReset);
    return () => window.removeEventListener(SIDEBAR_RESET_EVENT, onReset);
  }, []);

  // Cross-tab sync (desktop only — mobile ignores persisted state).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== SIDEBAR_STORAGE_KEY) return;
      if (!isDesktopViewport()) return;
      if (e.key === null || e.newValue === null) {
        setSidebarOpen(SIDEBAR_DEFAULT_OPEN);
        return;
      }
      setSidebarOpen(e.newValue !== "false");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={handleSidebarOpenChange}>
      <div className="min-h-screen flex w-full bg-background">
        <DashboardSidebar />

        <MobileSidebar open={mobileOpen} onOpenChange={setMobileOpen} />
        <CommandPalette />
        <OnboardingWalkthrough />
        <TourLauncher />

        <main className="flex-1 min-w-0 flex flex-col">
          <Topbar onMenuClick={() => setMobileOpen(true)} />
          <div className="flex-1 min-w-0">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default DashboardLayout;

