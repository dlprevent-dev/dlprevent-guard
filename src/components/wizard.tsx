import { ReactNode, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Reusable multi-step form wizard.
 *
 * Pattern: each step provides a `body` (the form content), a `canAdvance`
 * function (read-only validator — returns true/false/error-string), and
 * optional `onEnter`/`onExit` hooks (e.g. test connection on exit, refetch
 * suggestions on enter).
 *
 * The wizard owns ONLY the current step index. All form state lives in the
 * parent — the wizard never touches it. This keeps the wizard a thin shell
 * and lets the parent decide whether to commit at the end (single mutation)
 * or per step (e.g. test connection mid-flow).
 *
 * Use for:
 *   - "First endpoint" setup (provider → creds → test → save)
 *   - "First policy" setup (template → tune → preview → save)
 *   - "Connect a webhook" alert subscription flow
 *
 * Compose with `<Dialog>` for modal use or render inline for full-page
 * onboarding screens.
 */

export interface WizardStep {
  /** Short label for the stepper rail (5-10 chars ideal). */
  label: string;
  /** Full step title shown above the body. */
  title: string;
  /** Optional 1-2 sentence subtitle (renders below title in muted text). */
  description?: string;
  /** The actual form content. The parent owns all input state. */
  body: ReactNode;
  /**
   * Validator. Return:
   *  - `true` → user can advance
   *  - `false` → button disabled (silent)
   *  - `string` → button disabled + inline error explaining why
   * If omitted, defaults to always-allow.
   */
  canAdvance?: () => true | false | string;
  /** Called when the user clicks "Next" on this step. Async-friendly. */
  onExit?: () => Promise<void> | void;
  /** Called when the user lands on this step. */
  onEnter?: () => void;
}

export interface WizardProps {
  steps: WizardStep[];
  /** Called on final-step Finish. The parent does the persist + close. */
  onFinish: () => Promise<void> | void;
  /** Optional skip / cancel. If omitted, no skip button is rendered. */
  onCancel?: () => void;
  /** Override label of the last-step button (default: "Finish"). */
  finishLabel?: string;
  /** Override label of the cancel button (default: "Cancel"). */
  cancelLabel?: string;
  className?: string;
}

export function Wizard({
  steps, onFinish, onCancel,
  finishLabel = "Finish",
  cancelLabel = "Cancel",
  className,
}: WizardProps) {
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [exitError, setExitError] = useState<string | null>(null);

  const step = steps[idx];
  const isLast = idx === steps.length - 1;

  const validity = useMemo<true | false | string>(() => {
    if (!step.canAdvance) return true;
    try { return step.canAdvance(); } catch { return false; }
  }, [step]);

  const canGoNext = validity === true;
  const validityError = typeof validity === "string" ? validity : null;

  const goNext = async () => {
    setExitError(null);
    setBusy(true);
    try {
      await step.onExit?.();
      if (isLast) {
        await onFinish();
      } else {
        const nextIdx = idx + 1;
        setIdx(nextIdx);
        steps[nextIdx]?.onEnter?.();
      }
    } catch (e) {
      setExitError(e instanceof Error ? e.message : "Step failed; try again.");
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    if (idx === 0 || busy) return;
    setExitError(null);
    const prevIdx = idx - 1;
    setIdx(prevIdx);
    steps[prevIdx]?.onEnter?.();
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Stepper rail */}
      <ol className="flex items-center gap-1 px-1" aria-label="Wizard progress">
        {steps.map((s, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <li key={s.label} className="flex-1 flex items-center gap-1.5 min-w-0">
              <div
                className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 transition-colors",
                  done ? "bg-primary text-primary-foreground"
                    : active ? "bg-primary/15 text-primary border border-primary"
                    : "bg-muted text-muted-foreground",
                )}
                aria-current={active ? "step" : undefined}
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <div className={cn(
                "text-xs truncate",
                active ? "text-foreground font-medium" : "text-muted-foreground",
              )}>
                {s.label}
              </div>
              {i < steps.length - 1 && (
                <div className={cn(
                  "h-px flex-1 mx-0.5 transition-colors",
                  done ? "bg-primary" : "bg-muted",
                )} />
              )}
            </li>
          );
        })}
      </ol>

      {/* Step header */}
      <div>
        <div className="text-base font-semibold">{step.title}</div>
        {step.description && (
          <p className="text-sm text-muted-foreground mt-0.5">{step.description}</p>
        )}
      </div>

      {/* Step body — parent-owned form content */}
      <div className="min-h-[100px]">{step.body}</div>

      {/* Inline validity hint (e.g. "Provider key required") */}
      {validityError && (
        <div className="flex items-start gap-2 text-xs text-status-warn">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{validityError}</span>
        </div>
      )}

      {/* Exit-hook failure (e.g. "Test connection failed: 401") */}
      {exitError && (
        <div className="flex items-start gap-2 text-xs text-status-block bg-status-block/5 border border-status-block/30 rounded-md p-2">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{exitError}</span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
        <div>
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </Button>
          )}
        </div>
        <div className="flex gap-1.5">
          {idx > 0 && (
            <Button variant="outline" size="sm" onClick={goBack} disabled={busy}>
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>
          )}
          <Button size="sm" onClick={goNext} disabled={!canGoNext || busy}>
            {busy ? "Working…" : isLast ? finishLabel : "Next"}
            {!busy && !isLast && <ArrowRight className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
