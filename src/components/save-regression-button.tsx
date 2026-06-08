import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDashboardApi } from "@/lib/api";

/**
 * Capture a request log as a regression test (input direction, expected =
 * whatever the engine actually returned for this request). Sensible defaults —
 * the case can be renamed / curated on the Regression tests page.
 */
export function SaveRegressionButton({
  row,
  size = "sm",
  variant = "outline",
}: {
  row: any;
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost" | "secondary";
}) {
  const { call } = useDashboardApi();
  const save = useMutation({
    mutationFn: () =>
      call<{ ok: boolean; id: string }>("create_regression_from_log", {
        body: {
          log_id: row.id,
          // direction is derived server-side from the log's block side.
          expected_verdict:
            row.verdict ?? (String(row.status ?? "").startsWith("blocked") ? "block" : "allow"),
        },
      }),
    onSuccess: () => toast.success("Saved as regression test"),
    onError: (e: any) => toast.error(e?.message ?? "Failed to save regression test"),
  });
  return (
    <Button size={size} variant={variant} disabled={save.isPending} onClick={() => save.mutate()}>
      <ListPlus className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
      Save as regression test
    </Button>
  );
}
