import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useEvalApi } from "@/lib/eval-api";

type Result = {
  id: string; scenario_name: string; passed: boolean; verdict: string;
  response_text: string; latency_ms: number; tokens_in: number; tokens_out: number;
  judge_a_score: number | null; judge_b_score: number | null;
  judge_a_rationale: string | null; judge_b_rationale: string | null;
  confidence: number | null; disagreement: number | null;
};

export default function PlanReport() {
  const { runId } = useParams();
  const { call } = useEvalApi();

  const q = useQuery<{ run: any; results: Result[] }>({
    queryKey: ["eval-report", runId],
    queryFn: () => call("get_plan_report", { run_id: runId }),
    enabled: !!runId,
  });

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  const run = q.data?.run;
  const results = q.data?.results ?? [];
  const summary = run?.summary ?? {};
  const planName = run?.eval_plans?.name ?? "Plan";
  const targetName = run?.eval_plans?.agent_targets?.name ?? "—";

  return (
    <div className="space-y-4 print:space-y-2" id="report-root">
      <div className="print:hidden flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard/evaluate/test-lab"><ArrowLeft className="size-3 mr-1" />Back</Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Download className="size-4 mr-1" />Export PDF
        </Button>
      </div>

      <PageHeader
        title={`Evaluation report — ${planName}`}
        description={`Agent: ${targetName} • Transport: ${run?.eval_plans?.transport ?? "—"} • Run: ${new Date(run?.started_at ?? Date.now()).toLocaleString()}`}
      />


      <div className="grid gap-3 md:grid-cols-4">
        <Tile label="Pass rate" value={`${Math.round((summary.pass_rate ?? 0) * 100)}%`} sub={`${summary.passed ?? 0} / ${summary.total ?? 0}`} />
        <Tile label="Confidence" value={summary.flagged ? `⚠ ${summary.flagged} flagged` : "High"} sub="Judge agreement" />
        <Tile label="P95 latency" value={`${summary.p95_ms ?? 0} ms`} sub={`P50 ${summary.p50_ms ?? 0} ms`} />
        <Tile label="Tokens used" value={String(summary.tokens ?? 0)} />
      </div>

      {summary.axes && (
        <Card><CardContent className="p-4 space-y-2">
          <div className="font-medium">Axis scores (averaged across both judges)</div>
          <AxisBar label="Faithfulness" value={summary.axes.faithfulness} />
          <AxisBar label="Relevance" value={summary.axes.relevance} />
          <AxisBar label="Safety" value={summary.axes.safety} />
          <AxisBar label="Overall" value={summary.axes.robustness} />
        </CardContent></Card>
      )}

      <div className="space-y-2">
        <div className="font-medium">Per-question results</div>
        {results.map((r) => (
          <Card key={r.id}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                {r.passed ? <CheckCircle2 className="size-4 text-emerald-500" /> : <AlertTriangle className="size-4 text-destructive" />}
                <span className="font-medium text-sm">{r.scenario_name}</span>
                <Badge variant={r.passed ? "default" : "destructive"}>{r.verdict}</Badge>
                {r.disagreement != null && r.disagreement > 0.3 && (
                  <Badge variant="outline" className="text-amber-500 border-amber-500/40">Judges disagree</Badge>
                )}
                <div className="flex-1" />
                <span className="text-xs text-muted-foreground">{r.latency_ms}ms • {r.tokens_in + r.tokens_out} tok</span>
              </div>
              <div className="text-xs bg-muted/40 rounded p-2 whitespace-pre-wrap max-h-32 overflow-auto">{r.response_text || "(empty)"}</div>
              <div className="grid gap-1 md:grid-cols-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Judge A (Gemini): </span>
                  <span className="font-medium">{r.judge_a_score?.toFixed(2) ?? "—"}</span>
                  <div className="text-muted-foreground line-clamp-2">{r.judge_a_rationale}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Judge B (GLM): </span>
                  <span className="font-medium">{r.judge_b_score?.toFixed(2) ?? "—"}</span>
                  <div className="text-muted-foreground line-clamp-2">{r.judge_b_rationale}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </CardContent></Card>
  );
}

function AxisBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round((value ?? 0) * 100);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1"><span>{label}</span><span className="font-medium">{pct}%</span></div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
