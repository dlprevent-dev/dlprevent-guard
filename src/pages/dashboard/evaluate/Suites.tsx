import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Play, Trash2, Plus, FlaskConical } from "lucide-react";
import { useEvalApi } from "@/lib/eval-api";

type Suite = {
  id: string;
  name: string;
  description: string | null;
  endpoint_id: string | null;
  model_alias: string | null;
  grader_config: any;
  enabled: boolean;
  created_at: string;
};

type Run = {
  id: string;
  suite_id: string;
  status: string;
  summary: any;
  started_at: string;
  finished_at: string | null;
};

export default function Suites() {
  const { call } = useEvalApi();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const suitesQ = useQuery<{ suites: Suite[] }>({
    queryKey: ["eval-suites"],
    queryFn: () => call("list_suites"),
  });

  const runsQ = useQuery<{ runs: Run[] }>({
    queryKey: ["eval-runs"],
    queryFn: () => call("list_runs"),
    refetchInterval: 5000,
  });

  const createMut = useMutation({
    mutationFn: () => call("create_suite", { name, description }),
    onSuccess: () => {
      toast.success("Suite created");
      qc.invalidateQueries({ queryKey: ["eval-suites"] });
      setOpen(false); setName(""); setDescription("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => call("delete_suite", { id }),
    onSuccess: () => {
      toast.success("Suite deleted");
      qc.invalidateQueries({ queryKey: ["eval-suites"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runMut = useMutation({
    mutationFn: (suite_id: string) => call("run_suite", { suite_id }),
    onSuccess: (data: any) => {
      toast.success(`Run complete: ${data.passed}/${data.total} passed`);
      qc.invalidateQueries({ queryKey: ["eval-runs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const suites = suitesQ.data?.suites ?? [];
  const runs = runsQ.data?.runs ?? [];
  const lastRunBySuite = new Map<string, Run>();
  for (const r of runs) {
    if (!lastRunBySuite.has(r.suite_id)) lastRunBySuite.set(r.suite_id, r);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Test Suites"
        description="Offline evaluation harness. Group scenarios, pick graders, run on demand. Each run records pass/fail, latency, and judge rationale."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New suite</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create test suite</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <label className="text-xs text-muted-foreground">Name</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer-support agent — v2" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Description</label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this suite covers" rows={3} />
                </div>
                <div className="text-xs text-muted-foreground">
                  Default grader: LLM-as-judge (Gemini, via Lovable AI Gateway). You can edit grader config later via API.
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => createMut.mutate()} disabled={!name || createMut.isPending}>
                  {createMut.isPending ? "Creating…" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {suitesQ.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!suitesQ.isLoading && suites.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <FlaskConical className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <div className="text-sm font-medium">No suites yet</div>
            <div className="text-xs text-muted-foreground mt-1">Create a suite, add scenarios from the Scenarios tab, then run it.</div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {suites.map((s) => {
          const last = lastRunBySuite.get(s.id);
          return (
            <Card key={s.id}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{s.name}</div>
                  {s.description && <div className="text-xs text-muted-foreground truncate">{s.description}</div>}
                  <div className="flex items-center gap-2 mt-2 text-xs">
                    <Badge variant="outline">{(s.grader_config?.graders ?? []).length || 1} grader{(s.grader_config?.graders ?? []).length === 1 ? "" : "s"}</Badge>
                    {last && (
                      <Badge variant={last.status === "passed" ? "default" : last.status === "running" ? "secondary" : "destructive"}>
                        Last: {last.status} {last.summary?.passed != null && `(${last.summary.passed}/${last.summary.total})`}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={runMut.isPending} onClick={() => runMut.mutate(s.id)}>
                    <Play className="h-3.5 w-3.5 mr-1" /> Run
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete suite "${s.name}"?`)) deleteMut.mutate(s.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
