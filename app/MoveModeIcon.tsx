"use client";

import { useLocale } from "@/lib/i18n";
import {
  type MoveMode,
  moveModeIcon,
  moveModeLabelKey,
} from "@/lib/runs/moveMode";

/** How the run was done (foot, bike, car, plane), as an icon with a label for screen readers. */
export function MoveModeIcon({
  mode,
  showLabel = false,
  className = "",
}: {
  mode: MoveMode | null;
  showLabel?: boolean;
  className?: string;
}) {
  const { t } = useLocale();
  if (!mode) return null;
  const label = t(moveModeLabelKey(mode));
  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      title={label}
      aria-label={label}
      role="img"
    >
      <span aria-hidden className="text-sm leading-none">
        {moveModeIcon(mode)}
      </span>
      {showLabel && <span>{label}</span>}
    </span>
  );
}
