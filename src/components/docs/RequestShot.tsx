import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, ShieldAlert } from "lucide-react";

/**
 * Mock "screenshot" for docs — renders a paired request/response panel
 * styled like a terminal/devtools capture. Pure CSS, no real image asset,
 * so it stays crisp at any DPR and respects the theme.
 */
type Kind = "ok" | "blocked";

export function RequestShot({
  kind,
  title,
  subtitle,
  statusLabel,
  request,
  response,
}: {
  kind: Kind;
  title: string;
  subtitle?: string;
  statusLabel: string;
  request: { method: string; path: string; body: string };
  response: { status: string; body: string };
}) {
  const isOk = kind === "ok";
  return (
    <figure className="my-6 rounded-lg border border-border surface-1 overflow-hidden shadow-pop">
      {/* Title bar — mac-style traffic lights */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-border bg-surface-2">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 text-center">
          <span className="font-mono text-[11px] text-muted-foreground">{title}</span>
        </div>
        <Badge kind={kind}>{statusLabel}</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
        <Panel label="Request">
          <ReqHeader method={request.method} path={request.path} />
          <Body>{request.body}</Body>
        </Panel>
        <Panel label="Response">
          <ResHeader status={response.status} kind={kind} />
          <Body>{response.body}</Body>
        </Panel>
      </div>

      {subtitle && (
        <figcaption className="px-4 py-2.5 border-t border-border text-meta text-muted-foreground bg-surface-2 flex items-center gap-2">
          {isOk ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-status-ok" />
          ) : (
            <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
          )}
          {subtitle}
        </figcaption>
      )}
    </figure>
  );
}

function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="px-3 py-1.5 border-b border-border bg-surface-1/60">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

function ReqHeader({ method, path }: { method: string; path: string }) {
  return (
    <div className="px-3 py-2 border-b border-border/60 flex items-center gap-2 font-mono text-[11.5px]">
      <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary font-semibold">
        {method}
      </span>
      <span className="text-foreground/90 truncate">{path}</span>
    </div>
  );
}

function ResHeader({ status, kind }: { status: string; kind: Kind }) {
  return (
    <div className="px-3 py-2 border-b border-border/60 flex items-center gap-2 font-mono text-[11.5px]">
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          kind === "ok" ? "bg-status-ok" : "bg-destructive",
        )}
      />
      <span className="text-foreground/90">{status}</span>
    </div>
  );
}

function Body({ children }: { children: string }) {
  return (
    <pre className="px-3 py-2.5 overflow-x-auto text-[11.5px] leading-[1.55] font-mono text-foreground/90 bg-[hsl(var(--surface-1))] max-h-[280px]">
      <code>{children}</code>
    </pre>
  );
}

function Badge({ kind, children }: { kind: Kind; children: ReactNode }) {
  return (
    <span
      className={cn(
        "font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border",
        kind === "ok"
          ? "border-status-ok/40 text-status-ok bg-status-ok/10"
          : "border-destructive/40 text-destructive bg-destructive/10",
      )}
    >
      {children}
    </span>
  );
}
