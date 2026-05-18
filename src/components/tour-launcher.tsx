import { useEffect, useState } from "react";
import { GuidedTour } from "@/components/guided-tour";
import { TOUR_REGISTRY, type TourId } from "@/lib/tours";

/**
 * Sentinel tour-mount component. Mount once in the dashboard layout; it
 * listens for `tour:start` window events and renders the matching tour.
 *
 * Decoupling the mount from the launcher buttons means any component
 * anywhere in the tree can launch a tour without prop-drilling tour
 * state. Buttons just call `dispatchTourStart(id)`.
 *
 * Event shape: `new CustomEvent("tour:start", { detail: { id: "platform-v1" } })`
 */

const EVENT_NAME = "tour:start";

interface TourStartDetail {
  id: TourId;
}

export function TourLauncher() {
  const [activeId, setActiveId] = useState<TourId | null>(null);

  useEffect(() => {
    const onStart = (e: Event) => {
      const detail = (e as CustomEvent<TourStartDetail>).detail;
      if (!detail?.id || !(detail.id in TOUR_REGISTRY)) return;
      setActiveId(detail.id);
    };
    window.addEventListener(EVENT_NAME, onStart);
    return () => window.removeEventListener(EVENT_NAME, onStart);
  }, []);

  if (!activeId) return null;
  const config = TOUR_REGISTRY[activeId];

  return (
    <GuidedTour
      id={config.id}
      open={true}
      onClose={() => setActiveId(null)}
      steps={config.steps}
      finishLabel={config.finishLabel}
    />
  );
}

/**
 * Helper for launcher buttons. Type-safe: only known tour IDs accepted.
 *
 * Usage:
 *   <button onClick={() => dispatchTourStart("platform-v1")}>
 *     Take the platform tour
 *   </button>
 */
export function dispatchTourStart(id: TourId): void {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { id } }));
}
