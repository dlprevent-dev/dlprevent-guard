import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEvalApi } from "@/lib/eval-api";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Metrics = {
  window_days: number;
  total_requests: number;
  task_success_rate: number;
  verdict_mix: { allow: number; block: number; flag: number };
  p50_ms: number;
  p95_ms: number;
  total_tokens: number;
  total_cost_usd: number;
  cost_per_task: number;
  tokens_per_task: number;
  top_blocked_rules: { rule: string; count: number }[];
};

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function Productivity() {
  const { call } = useEvalApi();
  const [days, setDays] = useState(7);
  const q = useQuery<{ metrics: Metrics }>({
    queryKey: ["eval-productivity", days],
    queryFn: () => call<{ metrics: Metrics }>("productivity", { days }),
  });
  const m = q.data?.metrics;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Productivity"
        description="ROI, cost, latency, and adoption for live AI-agent traffic. Computed from your request logs."
      />
      <div className="flex items-center gap-2">
        {[1, 7, 30, 90].map((d) => (
          <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>
            Last {d}d
          </Button>
        ))}
      </div>

      {q.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {q.error && <div className="text-sm text-destructive">{(q.error as Error).message}</div>}
      {m && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile label="Total requests" value={m.total_requests.toLocaleString()} sub={`Last ${m.window_days} days`} />
            <Tile label="Task success rate" value={`${(m.task_success_rate * 100).toFixed(1)}%`} sub={`${m.verdict_mix.allow} allowed`} />
            <Tile label="p50 latency" value={`${m.p50_ms} ms`} sub={`p95 ${m.p95_ms} ms`} />
            <Tile label="Cost / task" value={`$${m.cost_per_task.toFixed(5)}`} sub={`${m.tokens_per_task} tokens avg`} />
            <Tile label="Total tokens" value={m.total_tokens.toLocaleString()} />
            <Tile label="Total cost" value={`$${m.total_cost_usd.toFixed(2)}`} />
            <Tile label="Blocked" value={m.verdict_mix.block.toString()} sub="Verdict = block" />
            <Tile label="Flagged" value={m.verdict_mix.flag.toString()} sub="Verdict = flag" />
          </div>

          <Card>
            <CardContent className="p-4">
              <div className="text-sm font-medium mb-3">Top blocked rules</div>
              {m.top_blocked_rules.length === 0 ? (
                <div className="text-sm text-muted-foreground">No blocked requests in this window.</div>
              ) : (
                <ul className="space-y-2">
                  {m.top_blocked_rules.map((r) => (
                    <li key={r.rule} className="flex items-center justify-between text-sm">
                      <span className="font-mono">{r.rule}</span>
                      <Badge variant="secondary">{r.count}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
