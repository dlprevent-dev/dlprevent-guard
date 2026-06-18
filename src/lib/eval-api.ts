import { useAuth } from "@clerk/clerk-react";
import { useCallback } from "react";

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

/** Eval section API — talks to the `eval` edge function. Same auth pattern
 *  as useDashboardApi but a separate function so we can ship the section
 *  without touching the 4000-line dashboard router. */
export function useEvalApi() {
  const { getToken } = useAuth();
  const call = useCallback(
    async <T = any>(action: string, body: Record<string, any> = {}): Promise<T> => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const res = await fetch(`${FN_BASE}/eval?action=${encodeURIComponent(action)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Request failed");
      return data;
    },
    [getToken],
  );
  return { call };
}
