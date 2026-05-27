import React, { useRef, useState, useEffect } from "react";
import { useCurrentFrame, interpolate, Easing } from "remotion";

type Props = {
  d: string;
  stroke: string;
  strokeWidth?: number;
  start?: number;
  duration?: number;
  fill?: string;
  glow?: boolean;
};

// Path draws on via strokeDashoffset from start frame over duration frames.
export const SvgPathDraw: React.FC<Props> = ({
  d, stroke, strokeWidth = 2, start = 0, duration = 30, fill = "none", glow = false,
}) => {
  const ref = useRef<SVGPathElement>(null);
  const [len, setLen] = useState(1000);
  useEffect(() => {
    if (ref.current) setLen(ref.current.getTotalLength());
  }, [d]);
  const f = useCurrentFrame();
  const p = interpolate(f, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <path
      ref={ref}
      d={d}
      stroke={stroke}
      strokeWidth={strokeWidth}
      fill={fill}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={len}
      strokeDashoffset={len * (1 - p)}
      style={glow ? { filter: `drop-shadow(0 0 8px ${stroke})` } : undefined}
    />
  );
};
