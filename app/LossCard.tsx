"use client";

import Link from "next/link";
import { CloseButton } from "@/app/CloseButton";
import { useLocale } from "@/lib/i18n";

export type Losses = {
  captured: number;
  attacked: number;
  by: Array<{
    address: string;
    username: string | null;
    captured: number;
    attacked: number;
  }>;
};

const BRAND = "#FF6B35";
/** Rivals named on the card. The rest are a count. */
const NAMED = 2;

/**
 * "You were raided", as a small card in the app's own look.
 *
 * Three tries got here. The first was a pale red card with a list, which
 * read like a form error. The second was a dark sheet over the whole screen,
 * which was louder than the news deserves and looked like another app
 * (0xj4an, 15 Nov 2026: "no puedes tapar toda la pantalla", "sigue los
 * colores de MiniKlaim"). This one is the size of the streak card it sits
 * above: the block shape from the logo with the loss inside it, one line
 * saying who, and one button that goes and takes them back.
 *
 * Presentation only. LossNotice decides when it is shown.
 */
export function LossCard({
  losses,
  onGo,
  onClose,
}: {
  losses: Losses;
  onGo: () => void;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const plural = (
    key:
      | "home.losses.captured"
      | "home.losses.attacked"
      | "home.losses.attacks",
    count: number,
  ) => t(count === 1 ? `${key}.one` : key).replace("{n}", String(count));

  // Blocks lost lead. A raid that only knocked levels off leads with those.
  const onlyAttacks = losses.captured === 0;
  const title = onlyAttacks
    ? plural("home.losses.attacked", losses.attacked)
    : plural("home.losses.captured", losses.captured);

  const named = losses.by.slice(0, NAMED).map((p) => {
    const name = p.username ? `@${p.username}` : t("common.anonymous");
    const n = onlyAttacks ? p.attacked : p.captured;
    return n > 0 ? `${name} ${n}` : name;
  });
  const others = losses.by.length - named.length;
  const who = [
    ...named,
    others > 0 ? t("home.losses.more").replace("{n}", String(others)) : null,
    !onlyAttacks && losses.attacked > 0
      ? plural("home.losses.attacks", losses.attacked)
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      role="status"
      className="loss-card relative w-full max-w-xs rounded-md border border-orange-200 bg-orange-50 px-4 py-3 pr-9 text-left"
    >
      <CloseButton
        onClick={onClose}
        className="absolute top-1 right-1 h-8 w-8 bg-transparent text-zinc-400"
      />
      <div className="flex items-center gap-3">
        <LossHex n={onlyAttacks ? losses.attacked : losses.captured} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold tracking-wide text-orange-700 uppercase">
            {t("home.losses.title")}
          </p>
          <p className="text-sm leading-tight font-semibold text-zinc-900">
            {title}
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs text-zinc-600">{who}</p>
        </div>
      </div>
      <Link
        href="/run"
        onClick={onGo}
        className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full bg-orange-700 px-4 text-sm font-semibold text-white hover:bg-orange-800"
      >
        {t("home.losses.go")}
      </Link>
    </div>
  );
}

/** The logo's block, with what was lost written inside it. */
function LossHex({ n }: { n: number }) {
  const text = `-${n > 999 ? "999+" : n}`;
  return (
    <svg
      aria-hidden
      width="52"
      height="52"
      viewBox="0 0 100 100"
      className="loss-hex shrink-0"
    >
      <polygon
        points="50,5 89,27.5 89,72.5 50,95 11,72.5 11,27.5"
        fill={BRAND}
      />
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize={text.length > 4 ? 22 : text.length > 3 ? 27 : 33}
        fontWeight="800"
        fill="#ffffff"
      >
        {text}
      </text>
    </svg>
  );
}
