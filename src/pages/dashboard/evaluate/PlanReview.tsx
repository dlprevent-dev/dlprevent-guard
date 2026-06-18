import { useParams, Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Play, CheckCircle2, ArrowLeft, Sparkles } from "lucide-react";
import { useEvalApi } from "@/lib/eval-api";

type Scenario = {
  id: string; name: string; category: string;
  turns: { role: string; content: string }[];
  expected: any; author_judge: string | null; approved: boolean;
};

export default function PlanReview() {
  const { planId } = useParams();
  const { call } = useEvalApi();
  const qc = useQueryClient();
  const nav = useNavigate();

  const q = useQuery<{ plan: any; scenarios: Scenario[] }>({
    queryKey: ["eval-plan", planId],
    queryFn: () => call("get_plan", { id: planId }),
    enabled: !!planId,
    refetchInterval: (query) => (query.state.data?.plan?.status === "generating" ? 3000 : false),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => call("delete_plan_scenario", { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-plan", planId] }),
  });
  const toggleMut = useMutation({
    mutationFn: (s: Scenario) => call("update_scenario", { id: s.id, approved: !s.approved }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-plan", planId] }),
  });
  const approveMut = useMutation({
    mutationFn: () => call("approve_plan", { id: planId }),
    onSuccess: () => { toast.success("Plan approved"); qc.invalidateQueries({ queryKey: ["eval-plan", planId] }); },
  });
  const runMut = useMutation({
    mutationFn: () => call<any>("run_plan", { plan_id: planId }),
    onSuccess: (d: any) => {
      toast.success(`Run complete: ${d.passed}/${d.total} passed`);
      nav(`/dashboard/evaluate/test-lab/report/${d.run_id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  const plan = q.data?.plan;
  const scenarios = q.data?.scenarios ?? [];
  const approvedCount = scenarios.filter((s) => s.approved).length;
  const byCat: Record<string, number> = {};
  for (const s of scenarios) byCat[s.category] = (byCat[s.category] ?? 0) + 1;
  const byJudge: Record<string, number> = {};
  for (const s of scenarios) byJudge[s.author_judge ?? "unknown"] = (byJudge[s.author_judge ?? "unknown"] ?? 0) + 1;

  return (
    <div className="space-y-4">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard/evaluate/test-lab"><ArrowLeft className="size-3 mr-1" />Back</Link>
        </Button>
      </div>
      <PageHeader title={plan?.name ?? "Plan"} description={`Status: ${plan?.status} • ${approvedCount}/${scenarios.length} approved`} />

      {plan?.status === "generating" && (
        <Card><CardContent className="p-6 text-center">
          <Sparkles className="size-6 mx-auto mb-2 animate-pulse text-primary" />
          Both judges are generating scenarios… this page will refresh automatically.
        </CardContent></Card>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        {Object.entries(byCat).map(([k, v]) => (
          <Badge key={k} variant="secondary">{k}: {v}</Badge>
        ))}
        <span className="text-xs text-muted-foreground mx-2">|</span>
        {Object.entries(byJudge).map(([k, v]) => (
          <Badge key={k} variant="outline">{k}: {v}</Badge>
        ))}
        <div className="flex-1" />
        {plan?.status === "pending_review" && (
          <Button onClick={() => approveMut.mutate()} disabled={approveMut.isPending || approvedCount === 0}>
            <CheckCircle2 className="size-4 mr-1" />Approve plan
          </Button>
        )}
        {plan?.status === "approved" && (
          <Button onClick={() => runMut.mutate()} disabled={runMut.isPending}>
            <Play className="size-4 mr-1" />{runMut.isPending ? "Running…" : "Run against agent"}
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {scenarios.map((s) => (
          <Card key={s.id} className={s.approved ? "" : "opacity-50"}>
            <CardContent className="p-3 flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={s.approved}
                onChange={() => toggleMut.mutate(s)}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{s.name}</span>
                  <Badge variant="outline" className="text-[10px]">{s.category}</Badge>
                  {s.author_judge && <Badge variant="secondary" className="text-[10px]">{s.author_judge}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {s.turns?.[0]?.content}
                </div>
                {s.expected?.criteria && (
                  <div className="text-xs mt-1"><span className="text-muted-foreground">Expected:</span> {s.expected.criteria}</div>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={() => delMut.mutate(s.id)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
