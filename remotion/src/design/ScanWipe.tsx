import React from "react";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { AbsoluteFill } from "remotion";
import { C } from "./tokens";

const ScanWipeC: React.FC<TransitionPresentationComponentProps<Record<string, never>>> = ({ children, presentationProgress, presentationDirection }) => {
  // entering scene comes in from right; line sweeps across
  const p = presentationProgress;
  const isEntering = presentationDirection === "entering";
  const clip = isEntering
    ? `inset(0 ${(1 - p) * 100}% 0 0)`
    : `inset(0 0 0 ${p * 100}%)`;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: clip }}>{children}</AbsoluteFill>
      {isEntering && p > 0 && p < 1 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${p * 100}%`,
            width: 2,
            background: C.signal,
            boxShadow: `0 0 24px ${C.signal}, 0 0 60px ${C.signal}80`,
          }}
        />
      )}
    </AbsoluteFill>
  );
};

export const scanWipe = (): TransitionPresentation<Record<string, never>> => ({
  component: ScanWipeC,
  props: {},
});
