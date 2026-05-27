import React from "react";
import { useCurrentFrame, interpolate, Easing } from "remotion";
import { FONTS } from "./tokens";

type Props = {
  from?: number;
  to: number;
  start?: number;
  duration?: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  size?: number;
  color?: string;
  weight?: number;
  letterSpacing?: number;
  family?: "sans" | "mono";
};

export const NumberTicker: React.FC<Props> = ({
  from = 0, to, start = 0, duration = 40, decimals = 0,
  suffix = "", prefix = "", size = 72, color = "#EDEFF5",
  weight = 600, letterSpacing = -1, family = "sans",
}) => {
  const f = useCurrentFrame();
  const v = interpolate(f, [start, start + duration], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const text = v.toFixed(decimals);
  return (
    <span style={{
      fontFamily: family === "mono" ? FONTS.mono : FONTS.sans,
      fontWeight: weight,
      fontSize: size,
      letterSpacing,
      color,
      fontVariantNumeric: "tabular-nums",
    }}>
      {prefix}{text}{suffix}
    </span>
  );
};
