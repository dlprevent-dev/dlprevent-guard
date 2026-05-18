import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { RotateCw } from "lucide-react";
import { toast } from "sonner";
import { stagePlaygroundReplay, payloadFromLogRow } from "@/lib/replay";

/**
 * Drop-in "Replay in Playground" button. Stashes the log's messages in
 * sessionStorage, then navigates to /dashboard/playground?replay=<id>.
 *
 * Failure modes:
 *  - row has no replayable messages (e.g., a rate-limited request that
 *    never carried a user prompt) → toast.error, no navigation
 *  - sessionStorage is unavailable (private mode) → soft-fail in
 *    `stagePlaygroundReplay`; we still navigate, and the Playground just
 *    won't prefill — the user sees the default sample prompt.
 */
export function ReplayButton({ row, size = "sm", variant = "outline", className }: {
  row: {
    id: string;
    api_key_id?: string | null;
    model?: string | null;
    messages?: unknown;
    created_at?: string;
    verdict?: string | null;
    block_reason?: string | null;
  } | null | undefined;
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost" | "secondary";
  className?: string;
}) {
  const navigate = useNavigate();

  const onReplay = () => {
    const payload = payloadFromLogRow(row);
    if (!payload) {
      toast.error("This log has no replayable messages.", {
        description: "Rate-limited / auth-failed requests don't carry a user prompt.",
      });
      return;
    }
    try {
      const url = stagePlaygroundReplay(payload);
      navigate(url);
    } catch (e) {
      toast.error("Couldn't stage replay", {
        description: e instanceof Error ? e.message : "unknown error",
      });
    }
  };

  return (
    <Button
      size={size}
      variant={variant}
      onClick={onReplay}
      className={className}
      title="Re-run this request through the Playground"
    >
      <RotateCw className="h-3.5 w-3.5" />
      Replay in Playground
    </Button>
  );
}
