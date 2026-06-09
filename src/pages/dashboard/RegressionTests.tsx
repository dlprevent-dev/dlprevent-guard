import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Play, Trash2, ListChecks } from "lucide-react";
import { useDashboardApi } from "@/lib/api";

// Saved policy regression cases (captured from request logs via
// create_regression_from_log, or authored). Replays them through the live
// policy engine with deterministic layers to catch behavior regressions.

type RegTest = {
  id: string;
  name: string;
  direction: string;
  expected_verdict: string;
  enabled: boolean;
  last_run_verdict: string | null;
  last_run_passed: boolean | null;
  last_run_at: string | null;
};

const RegressionTests = () => {
  const { call } = useDashboardApi();
  const qc = useQueryClient();
  const listQ = useQuery<{ tests: RegTest[] }>({
    queryKey: ["regression_tests"],
    queryFn: () => call("list_regression_tests"),
  });
  const [lastSummary, setLastSummary] = useState<{ total: number; passed: number; failed: number } | null>(null);

  const runAll = useMutation({
    mutationFn: () => call<{ summary: { total: number; passed: number; failed: number } }>("run_regression_tests"),
    onSuccess: (r) => {
      setLastSummary(r.summary);
      toast.success(`Ran ${r.summary.total} — ${r.summary.passed} passed, ${r.summary.failed} failed`);
      qc.invalidateQueries({ queryKey: ["regression_tests"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Run failed"),
  });

  const del = useMutation({
    mutationFn: (id: string) => call("delete_regression_test", { body: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["regression_tests"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => call("toggle_regression_test", { body: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["regression_tests"] }),
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  const tests = listQ.data?.tests ?? [];

  return (
    <div className="px-4 md:px-6 py-5 space-y-4 max-w-5xl mx-auto">
      <PageHeader
        title="Regression tests"
        description="Saved policy cases captured from request logs. Replay them through the engine to catch behavior regressions before they ship."
        actions={
          <Button size="sm" disabled={runAll.isPending || tests.length === 0} onClick={() => runAll.mutate()}>
            <Play className="h-4 w-4 mr-1.5" aria-hidden="true" /> Run all
          </Button>
        }
      />

      {lastSummary && (
        <Card className="surface-1 border-border">
          <CardContent className="p-4 flex gap-6 text-sm">
            <span>Total <b>{lastSummary.total}</b></span>
            <span className="text-green-500">Passed <b>{lastSummary.passed}</b></span>
            <span className="text-red-500">Failed <b>{lastSummary.failed}</b></span>
          </CardContent>
        </Card>
      )}

      {tests.length === 0 ? (
        <Card className="surface-1 border-border">
          <CardContent className="p-8 text-center text-muted-foreground">
            <ListChecks className="h-6 w-6 mx-auto mb-2 opacity-60" aria-hidden="true" />
            No regression tests yet. Open a request on the Logs page and choose
            “Save as regression test”.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tests.map((t) => (
            <Card key={t.id} className="surface-1 border-border">
              <CardContent className="p-3 flex items-center gap-3">
                <Switch
                  checked={t.enabled}
                  onCheckedChange={(v) => toggle.mutate({ id: t.id, enabled: v })}
                  aria-label={`${t.enabled ? "Disable" : "Enable"} ${t.name}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-body font-medium truncate">{t.name}</div>
                  <div className="text-meta text-muted-foreground">
                    {t.direction} · expects <b>{t.expected_verdict}</b>
                    {t.last_run_at && <> · last run: {t.last_run_verdict}</>}
                  </div>
                </div>
                {t.last_run_passed != null && (
                  <Badge variant={t.last_run_passed ? "default" : "destructive"}>
                    {t.last_run_passed ? "pass" : "fail"}
                  </Badge>
                )}
                <Button variant="ghost" size="icon" onClick={() => del.mutate(t.id)} aria-label={`Delete ${t.name}`}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default RegressionTests;
