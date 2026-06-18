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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Sparkles, Plus, MessageSquare } from "lucide-react";
import { useEvalApi } from "@/lib/eval-api";

type Scenario = {
  id: string;
  name: string;
  category: string;
  turns: { role: string; content: string }[];
  expected: any;
  source: string;
  suite_id: string | null;
  created_at: string;
};

type Suite = { id: string; name: string };

const CATEGORIES = ["happy_path", "edge_case", "adversarial", "tool_misuse", "long_horizon", "safety", "retrieval"];

export default function Scenarios() {
  const { call } = useEvalApi();
  const qc = useQueryClient();
  const [genOpen, setGenOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [count, setCount] = useState(5);
  const [genSuiteId, setGenSuiteId] = useState<string | undefined>(undefined);
  const [filterSuite, setFilterSuite] = useState<string | "all">("all");

  // Manual form
  const [name, setName] = useState("");
  const [category, setCategory] = useState("happy_path");
  const [userTurn, setUserTurn] = useState("");
  const [criteria, setCriteria] = useState("");
  const [suiteId, setSuiteId] = useState<string | undefined>(undefined);

  const suitesQ = useQuery<{ suites: Suite[] }>({ queryKey: ["eval-suites"], queryFn: () => call("list_suites") });
  const scenariosQ = useQuery<{ scenarios: Scenario[] }>({
    queryKey: ["eval-scenarios", filterSuite],
    queryFn: () => call("list_scenarios", filterSuite === "all" ? {} : { suite_id: filterSuite }),
  });

  const generateMut = useMutation({
    mutationFn: () => call("generate_scenarios", { description, count, suite_id: genSuiteId }),
    onSuccess: (data: any) => {
      toast.success(`Generated ${data.generated} scenarios`);
      qc.invalidateQueries({ queryKey: ["eval-scenarios"] });
      setGenOpen(false); setDescription(""); setGenSuiteId(undefined);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: () => call("create_scenario", {
      name, category,
      turns: [{ role: "user", content: userTurn }],
      expected: criteria ? { criteria } : null,
      suite_id: suiteId,
    }),
    onSuccess: () => {
      toast.success("Scenario added");
      qc.invalidateQueries({ queryKey: ["eval-scenarios"] });
      setNewOpen(false); setName(""); setUserTurn(""); setCriteria(""); setSuiteId(undefined);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => call("delete_scenario", { id }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["eval-scenarios"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const suites = suitesQ.data?.suites ?? [];
  const scenarios = scenariosQ.data?.scenarios ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Scenarios"
        description="Test cases — happy path, edge cases, adversarial, tool-misuse. Author by hand or auto-generate with Lovable AI."
        actions={
          <div className="flex gap-2">
            <Dialog open={genOpen} onOpenChange={setGenOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline"><Sparkles className="h-4 w-4 mr-1" /> Generate</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Generate scenarios</DialogTitle></DialogHeader>
                <div className="space-y-3 py-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Describe the agent</label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
                      placeholder="A retail customer-support agent that handles refunds, order status, and returns. Has access to order_lookup and refund tools." />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">How many</label>
                      <Input type="number" min={1} max={10} value={count} onChange={(e) => setCount(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Add to suite (optional)</label>
                      <Select value={genSuiteId} onValueChange={setGenSuiteId}>
                        <SelectTrigger><SelectValue placeholder="Library" /></SelectTrigger>
                        <SelectContent>
                          {suites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => generateMut.mutate()} disabled={!description || generateMut.isPending}>
                    {generateMut.isPending ? "Generating…" : "Generate"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={newOpen} onOpenChange={setNewOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add scenario</DialogTitle></DialogHeader>
                <div className="space-y-3 py-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Name</label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Category</label>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Suite</label>
                      <Select value={suiteId} onValueChange={setSuiteId}>
                        <SelectTrigger><SelectValue placeholder="Library" /></SelectTrigger>
                        <SelectContent>{suites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">User turn</label>
                    <Textarea value={userTurn} onChange={(e) => setUserTurn(e.target.value)} rows={3} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Pass criteria (for LLM judge)</label>
                    <Textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} rows={2}
                      placeholder="What does a correct response look like?" />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => createMut.mutate()} disabled={!name || !userTurn || createMut.isPending}>
                    {createMut.isPending ? "Saving…" : "Save"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Filter:</span>
        <Select value={filterSuite} onValueChange={(v) => setFilterSuite(v as any)}>
          <SelectTrigger className="w-[220px] h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All scenarios</SelectItem>
            {suites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {scenariosQ.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!scenariosQ.isLoading && scenarios.length === 0 && (
        <Card><CardContent className="p-8 text-center">
          <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <div className="text-sm font-medium">No scenarios yet</div>
          <div className="text-xs text-muted-foreground mt-1">Use “Generate” to auto-create some, or “New” to write one.</div>
        </CardContent></Card>
      )}

      <div className="space-y-2">
        {scenarios.map((s) => (
          <Card key={s.id}>
            <CardContent className="p-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{s.name}</span>
                  <Badge variant="outline" className="text-[10px]">{s.category}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{s.source}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1 truncate">
                  {s.turns?.[0]?.content?.slice(0, 200) ?? "—"}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete "${s.name}"?`)) deleteMut.mutate(s.id); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
