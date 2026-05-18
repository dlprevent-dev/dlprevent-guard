import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * In-page guided tour driver.
 *
 * Pass an array of steps with a CSS selector pointing at the element to
 * spotlight + a tooltip body. The driver:
 *   - locks scroll on the page
 *   - dims everything except the spotlighted element (clip-path mask)
 *   - positions a tooltip near the target (auto-flips top↔bottom on
 *     viewport overflow)
 *   - re-measures on resize / scroll
 *   - shows Back / Next / Skip controls
 *
 * Selectors should be stable — prefer `data-tour="thing"` attributes
 * over class names, which churn.
 *
 * Use cases:
 *   - Per-page tour on first visit (e.g. /dashboard/logs first time)
 *   - "Re-take the tour" command from a Help menu
 *
 * Storage key: each tour has a unique `id`; visited tours are tracked
 * via `tour-visited:<id>` in localStorage so they don't auto-fire twice.
 */

export interface TourStep {
  /** CSS selector for the element to spotlight. */
  selector: string;
  /** Short title shown above the body in the tooltip. */
  title: string;
  /** 1-2 sentences explaining what this element does. */
  body: string;
  /** Optional: preferred tooltip placement; auto-flips on overflow. */
  placement?: "top" | "bottom" | "auto";
}

export interface GuidedTourProps {
  /** Unique tour id (used for localStorage visited-tracking). */
  id: string;
  /** Open the tour when true; the parent owns this state. */
  open: boolean;
  /** Called when the tour closes (finish OR skip OR escape). */
  onClose: () => void;
  /** Ordered step list. */
  steps: TourStep[];
  /** Optional label override for the "finish" button on the last step. */
  finishLabel?: string;
}

const SPOTLIGHT_PADDING = 8; // pixels of breathing room around the target
const TOOLTIP_GAP = 12; // gap between tooltip and target rect

interface Rect { top: number; left: number; width: number; height: number }

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/** Returns true if `rect` overflows the viewport bottom by `tooltipHeight + gap`. */
function tooltipBelowOverflows(rect: Rect, tooltipHeight: number): boolean {
  return rect.top + rect.height + TOOLTIP_GAP + tooltipHeight > window.innerHeight;
}

export function GuidedTour({ id, open, onClose, steps, finishLabel = "Finish tour" }: GuidedTourProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [missing, setMissing] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step = steps[stepIdx];

  // Lookup + measure the target. Re-runs on step change, window resize,
  // and any scroll (capture phase, so nested-scroll containers fire too).
  useEffect(() => {
    if (!open || !step) return;

    let raf = 0;
    const measure = () => {
      const el = document.querySelector(step.selector);
      if (!el) {
        setMissing(true);
        setTargetRect(null);
        return;
      }
      setMissing(false);
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      // Re-measure after scroll settles (one rAF is usually enough).
      raf = requestAnimationFrame(() => setTargetRect(rectOf(el)));
    };

    measure();
    const onWindow = () => setTargetRect((prev) => {
      const el = document.querySelector(step.selector);
      return el ? rectOf(el) : prev;
    });
    window.addEventListener("resize", onWindow);
    window.addEventListener("scroll", onWindow, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onWindow);
      window.removeEventListener("scroll", onWindow, true);
    };
  }, [open, step]);

  // Lock body scroll while the tour is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Esc closes the tour.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Reset step when tour reopens.
  useEffect(() => { if (open) setStepIdx(0); }, [open]);

  // Compute tooltip position.
  const tooltipPos = useMemo(() => {
    if (!targetRect) return null;
    // Default to below; flip to above if it overflows.
    const tooltipHeight = tooltipRef.current?.offsetHeight ?? 160;
    const tooltipWidth = tooltipRef.current?.offsetWidth ?? 320;
    const preferTop = step?.placement === "top" || tooltipBelowOverflows(targetRect, tooltipHeight);
    const top = preferTop
      ? Math.max(8, targetRect.top - TOOLTIP_GAP - tooltipHeight)
      : Math.min(window.innerHeight - tooltipHeight - 8, targetRect.top + targetRect.height + TOOLTIP_GAP);
    const leftRaw = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
    const left = Math.max(8, Math.min(window.innerWidth - tooltipWidth - 8, leftRaw));
    return { top, left };
  }, [targetRect, step?.placement]);

  if (!open || !step) return null;

  // Mark this tour as visited when the user closes it.
  const close = () => {
    try { localStorage.setItem(`tour-visited:${id}`, "1"); } catch { /* ignore */ }
    onClose();
  };

  const isLast = stepIdx === steps.length - 1;

  // The overlay is a fixed full-screen layer. We cut a hole using clip-path
  // (evenodd fill-rule via SVG) so clicks fall through onto the spotlighted
  // element. The tooltip floats on top with its own click handlers.
  const overlay = (
    <div className="fixed inset-0 z-[1000]" aria-modal="true" role="dialog">
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <mask id={`tour-mask-${id}`}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left - SPOTLIGHT_PADDING}
                y={targetRect.top - SPOTLIGHT_PADDING}
                width={targetRect.width + SPOTLIGHT_PADDING * 2}
                height={targetRect.height + SPOTLIGHT_PADDING * 2}
                rx="6"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0" y="0" width="100%" height="100%"
          fill="rgba(0,0,0,0.55)"
          mask={`url(#tour-mask-${id})`}
        />
        {/* Outline around the spotlighted element */}
        {targetRect && (
          <rect
            x={targetRect.left - SPOTLIGHT_PADDING}
            y={targetRect.top - SPOTLIGHT_PADDING}
            width={targetRect.width + SPOTLIGHT_PADDING * 2}
            height={targetRect.height + SPOTLIGHT_PADDING * 2}
            rx="6"
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="2"
          />
        )}
      </svg>

      {/* Tooltip card */}
      {tooltipPos && (
        <div
          ref={tooltipRef}
          className={cn(
            "absolute w-80 max-w-[90vw] rounded-lg border border-border bg-popover text-popover-foreground shadow-xl p-4",
          )}
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Step {stepIdx + 1} of {steps.length}
            </div>
            <button
              type="button"
              onClick={close}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close tour"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="text-sm font-semibold mb-1">{step.title}</div>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">{step.body}</p>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={close}>Skip</Button>
            <div className="flex gap-1.5">
              {stepIdx > 0 && (
                <Button variant="outline" size="sm" onClick={() => setStepIdx(stepIdx - 1)}>
                  <ArrowLeft className="h-3 w-3" />
                  Back
                </Button>
              )}
              {isLast ? (
                <Button size="sm" onClick={close}>{finishLabel}</Button>
              ) : (
                <Button size="sm" onClick={() => setStepIdx(stepIdx + 1)}>
                  Next
                  <ArrowRight className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* "Element not found" fallback — show a centered card so the user
          isn't left staring at a dimmed screen if a selector breaks. */}
      {missing && !targetRect && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 rounded-lg border border-border bg-popover p-4 shadow-xl">
          <div className="text-sm font-semibold mb-1">Step target not found</div>
          <p className="text-xs text-muted-foreground mb-3">
            The element this step points at isn't on the current page. This usually
            means the layout changed since the tour was written. Skip ahead or close.
          </p>
          <div className="flex gap-1.5 justify-end">
            <Button variant="outline" size="sm" onClick={close}>Close tour</Button>
            {!isLast && (
              <Button size="sm" onClick={() => setStepIdx(stepIdx + 1)}>Skip step</Button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(overlay, document.body);
}

/** Helper: read whether the user has finished a given tour before. */
export function hasVisitedTour(id: string): boolean {
  try { return localStorage.getItem(`tour-visited:${id}`) === "1"; }
  catch { return false; }
}

/** Helper: clear the visited flag (useful for re-take-tour menu). */
export function resetVisitedTour(id: string): void {
  try { localStorage.removeItem(`tour-visited:${id}`); }
  catch { /* ignore */ }
}
