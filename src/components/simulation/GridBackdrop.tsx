import { useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * Animated grid + drifting particle field for the simulation hero.
 * Pure CSS — transform/opacity only — particle count capped at 36.
 */
export const GridBackdrop = ({ className }: { className?: string }) => {
  const particles = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: `${(i * 137) % 100}%`,
        top: `${(i * 53) % 100}%`,
        delay: `${(i % 12) * 0.6}s`,
        duration: `${8 + ((i * 7) % 11)}s`,
        size: i % 4 === 0 ? 3 : 2,
      })),
    [],
  );

  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      {/* base radial wash */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.12),transparent_60%)]" />
      {/* grid */}
      <div className="absolute inset-0 bg-grid-fade opacity-60" />
      {/* slow drifting glow */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[60rem] h-[60rem] rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.18),transparent_60%)] animate-[grid-drift_18s_ease-in-out_infinite]" />
      {/* particles */}
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-primary/40 animate-[particle-rise_var(--d)_linear_infinite]"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            // @ts-expect-error css var
            "--d": p.duration,
            animationDelay: p.delay,
          }}
        />
      ))}
      <style>{`
        @keyframes grid-drift {
          0%, 100% { transform: translate(-50%, 0) scale(1); opacity: 0.7; }
          50%      { transform: translate(-50%, -4%) scale(1.05); opacity: 1; }
        }
        @keyframes particle-rise {
          0%   { transform: translateY(0) translateX(0); opacity: 0; }
          10%  { opacity: 0.8; }
          90%  { opacity: 0.6; }
          100% { transform: translateY(-220px) translateX(12px); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-\\[grid-drift_18s_ease-in-out_infinite\\],
          .animate-\\[particle-rise_var\\(--d\\)_linear_infinite\\] {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default GridBackdrop;
