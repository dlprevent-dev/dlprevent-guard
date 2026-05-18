import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, ShieldCheck, Ban, Flag, Activity, AlertTriangle, Sparkles, HelpCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useDashboardApi } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { GuidedTour, hasVisitedTour, type TourStep } from "@/components/guided-tour";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  BarChart, Bar, CartesianGrid,
} from "recharts";

type Range = "24h" | "7d" | "30d";

interface AttackOverview {
  range: string;
  range_hours: number;
  total_requests: number;
  allowed_count: number;
  blocked_count: number;
  flagged_count: number;
  block_rate_pct: number;
  top_block_reasons: { reason: string; count: number }[];
  layer_breakdown: { layer: string; blocks: number; flags: number }[];
  hourly: { hour: string; total: number; blocked: number; flagged: number }[];
}

const fmtHour = (iso: string) => {
  const d = new Date(iso);
  return d.getHours().toString().padStart(2, "0") + ":00";
};

const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export default function Threats() {
  const { call } = useDashboardApi();
  const [range, setRange] = useState<Range>("24h");
  const [tourOpen, setTourOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["attack_overview", range],
    queryFn: () => call<AttackOverview>("attack_overview", { query: { range } }),
    refetchInterval: 60_000,
  });

  // Auto-open the tour on the first ever visit to this page. Slight delay
  // so the page lays out before the spotlight measures elements.
  useEffect(() => {
    if (!hasVisitedTour("threats-v1")) {
      const t = setTimeout(() => setTourOpen(true), 400);
      return () => clearTimeout(t);
    }
  }, []);

  const tourSteps: TourStep[] = [
    {
      selector: '[data-tour="threats-hero"]',
      title: "Single-glance status",
      body: "One of three states: Waiting for traffic / All clear / N requests blocked. Color matches severity — orange = flags only, red = blocks present.",
      placement: "bottom",
    },
    {
      selector: '[data-tour="threats-kpis"]',
      title: "Volume + block rate",
      body: "Total requests, blocked count, flagged count, and block rate. A block rate above 5% turns this card red — usually means a single key is being attacked or a noisy rule needs tuning.",
      placement: "bottom",
    },
    {
      selector: '[data-tour="threats-range"]',
      title: "Window selector",
      body: "Switch between 24h / 7d / 30d. All KPIs, charts, and breakdowns below update together. Use 30d to spot slow-burn campaigns.",
      placement: "bottom",
    },
    {
      selector: '[data-tour="threats-help"]',
      title: "Replay this tour anytime",
      body: "Re-take this 4-step walkthrough whenever — useful after the dashboard ships new surfaces, or when you're showing AnveGuard to a teammate. For full request detail (and the Replay button to re-run any blocked prompt), open Logs.",
      placement: "bottom",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Threats"
        description="Live view of what the policy engine is catching across your workspace."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTourOpen(true)}
              data-tour="threats-help"
              title="Take a guided tour of this page"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              Tour
            </Button>
            <Select value={range} onValueChange={(v) => setRange(v as Range)}>
              <SelectTrigger data-tour="threats-range" className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      <GuidedTour
        id="threats-v1"
        open={tourOpen}
        onClose={() => setTourOpen(false)}
        steps={tourSteps}
        finishLabel="Got it"
      />

      {error && (
        <Card className="border-destructive p-4 text-sm text-destructive">
          Failed to load attack overview: {(error as Error).message}
        </Card>
      )}

      {/* Hero status banner — single most-important live signal. Color +
          headline reflect what's happening RIGHT NOW. Replaces the
          "wall of stats" feel with a focused operational read. */}
      {!isLoading && data && (
        <div data-tour="threats-hero">
          <HeroStatus data={data} />
        </div>
      )}

      {/* KPI strip */}
      <div data-tour="threats-kpis" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          label="Total requests"
          value={data?.total_requests}
          loading={isLoading}
          icon={Activity}
          tone="muted"
        />
        <Kpi
          label="Blocked"
          value={data?.blocked_count}
          loading={isLoading}
          icon={Ban}
          tone="block"
        />
        <Kpi
          label="Flagged"
          value={data?.flagged_count}
          loading={isLoading}
          icon={Flag}
          tone="warn"
        />
        <Kpi
          label="Block rate"
          value={data?.block_rate_pct}
          suffix="%"
          loading={isLoading}
          icon={ShieldAlert}
          tone={data && data.block_rate_pct > 5 ? "block" : "muted"}
        />
      </div>

      {/* Hourly time-series */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Activity over the {range === "24h" ? "last 24 hours" : range === "7d" ? "last 7 days" : "last 30 days"}
          </h3>
          {data && (
            <span className="text-meta text-muted-foreground">
              {data.allowed_count.toLocaleString()} allowed · {data.flagged_count.toLocaleString()} flagged · {data.blocked_count.toLocaleString()} blocked
            </span>
          )}
        </div>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !data || data.hourly.every((h) => h.total === 0) ? (
          <EmptyState
            icon={<Activity className="h-5 w-5" />}
            title="No traffic in this window"
            description="As soon as the proxy starts logging requests, you'll see hourly activity here."
          />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.hourly}>
              <defs>
                <linearGradient id="allowed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="threats" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="hour"
                tickFormatter={range === "24h" ? fmtHour : fmtDay}
                fontSize={11}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                labelFormatter={(v) => new Date(v as string).toLocaleString()}
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fill="url(#allowed)" name="Total" />
              <Area type="monotone" dataKey="blocked" stroke="hsl(var(--destructive))" fill="url(#threats)" name="Blocked" />
              <Area type="monotone" dataKey="flagged" stroke="hsl(var(--warning, 38 92% 50%))" fill="transparent" name="Flagged" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Layer breakdown */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Detector layer breakdown</h3>
          <p className="mb-3 text-meta text-muted-foreground">
            Which engine layer caught each verdict. Higher bars = more contribution.
          </p>
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : !data || data.layer_breakdown.length === 0 ? (
            <EmptyState
              icon={<ShieldAlert className="h-5 w-5" />}
              title="No detector hits yet"
              description="The engine hasn't fired on any request in this window."
            />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.layer_breakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="layer" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="blocks" stackId="a" fill="hsl(var(--destructive))" name="Blocks" />
                <Bar dataKey="flags" stackId="a" fill="hsl(38 92% 50%)" name="Flags" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Top reasons */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Top block reasons</h3>
          <p className="mb-3 text-meta text-muted-foreground">
            The most common reasons the engine blocked a request. Useful to spot
            recurring attack themes or noisy false positives.
          </p>
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : !data || data.top_block_reasons.length === 0 ? (
            <EmptyState
              icon={<AlertTriangle className="h-5 w-5" />}
              title="No blocks in this window"
              description="Either traffic is clean, or no requests came through."
            />
          ) : (
            <ul className="space-y-2">
              {data.top_block_reasons.map((r) => (
                <li key={r.reason} className="flex items-start justify-between gap-3 rounded border border-border bg-surface-2 px-3 py-2">
                  <span className="line-clamp-2 text-sm" title={r.reason}>{r.reason}</span>
                  <Badge variant="outline" className="shrink-0 tabular-nums">{r.count}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function HeroStatus({ data }: { data: AttackOverview }) {
  const blocked = data.blocked_count;
  const flagged = data.flagged_count;
  const total = data.total_requests;
  const noTraffic = total === 0;

  // Three states drive a different color, headline, and primary action.
  if (noTraffic) {
    return (
      <Card className="p-5 border-border bg-surface-2/40">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-muted/40 text-muted-foreground">
              <Activity className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Waiting for traffic</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Once requests start flowing through the proxy, this page becomes your live SOC view —
                blocks, flags, attack patterns, and per-layer signal.
              </p>
            </div>
          </div>
          <Button asChild size="sm">
            <Link to="/dashboard/playground">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Send a test request
            </Link>
          </Button>
        </div>
      </Card>
    );
  }

  if (blocked === 0 && flagged === 0) {
    return (
      <Card className="p-5 border-status-ok/30 bg-status-ok/5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-status-ok/15 text-status-ok">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-semibold">All clear</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {total.toLocaleString()} requests in the selected window — engine evaluated every one and found nothing to block or flag.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const tone = blocked > 0 ? "block" : "warn";
  const Icon = blocked > 0 ? Ban : Flag;
  const headline =
    blocked > 0
      ? `${blocked.toLocaleString()} request${blocked === 1 ? "" : "s"} blocked`
      : `${flagged.toLocaleString()} request${flagged === 1 ? "" : "s"} flagged`;
  const sub =
    blocked > 0
      ? `Engine intercepted ${blocked.toLocaleString()} blocked + ${flagged.toLocaleString()} flagged across ${total.toLocaleString()} requests · ${data.block_rate_pct}% block rate`
      : `${flagged.toLocaleString()} flag${flagged === 1 ? "" : "s"} across ${total.toLocaleString()} requests — review below to spot patterns or false positives`;

  return (
    <Card
      className={
        tone === "block"
          ? "p-5 border-status-block/40 bg-status-block/5"
          : "p-5 border-status-warn/40 bg-status-warn/5"
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={
            tone === "block"
              ? "grid h-10 w-10 place-items-center rounded-lg bg-status-block/15 text-status-block"
              : "grid h-10 w-10 place-items-center rounded-lg bg-status-warn/15 text-status-warn"
          }
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold tabular-nums">{headline}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>
        </div>
      </div>
    </Card>
  );
}

function Kpi({
  label, value, loading, icon: Icon, tone, suffix,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  icon: typeof Activity;
  tone: "muted" | "warn" | "block";
  suffix?: string;
}) {
  const toneClass =
    tone === "block" ? "text-destructive" :
    tone === "warn"  ? "text-amber-500" :
                       "text-muted-foreground";
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-meta text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${toneClass}`} aria-hidden="true" />
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-20" />
      ) : (
        <div className="mt-1 text-2xl font-semibold tabular-nums">
          {value === undefined ? "—" : value.toLocaleString()}{suffix ?? ""}
        </div>
      )}
    </Card>
  );
}
