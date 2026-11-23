"use client";

import { Children, type ReactNode, useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n";

/**
 * One notice at a time on the home screen.
 *
 * The home notices (blocks lost, badges to claim, low CELO, streak) each load
 * their own data and render nothing when they have nothing to say. Stacked,
 * a returning player could meet four cards before the Start button. Here they
 * share one slot: the first one with something to show is visible, in the
 * order given, and the dots step through the rest.
 *
 * The notices stay mounted so their own logic and tracking run as before; a
 * waiting one is only hidden, and one with nothing in the slot is left
 * alone so its own toast or modal still shows. Whether a notice has content is read from the
 * DOM, so none of them had to change.
 */
export function NoticeStack({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const root = useRef<HTMLDivElement>(null);
  const [filled, setFilled] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const items = Children.toArray(children);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const read = () => {
      const next = Array.from(el.querySelectorAll(":scope > [data-notice]"))
        .map((n, i) =>
          // A notice's toast or modal is position: fixed and lives outside
          // the slot; only content laid out in the slot counts.
          Array.from(n.children).some(
            (c) => getComputedStyle(c).position !== "fixed",
          )
            ? i
            : -1,
        )
        .filter((i) => i >= 0);
      setFilled((cur) =>
        cur.length === next.length && cur.every((v, i) => v === next[i])
          ? cur
          : next,
      );
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  const active =
    picked !== null && filled.includes(picked) ? picked : (filled[0] ?? null);

  return (
    <div ref={root} className={`flex w-full flex-col items-center`}>
      {items.map((child, i) => (
        <div
          key={i}
          data-notice
          className={`flex w-full flex-col items-center ${filled.includes(i) && i !== active ? "hidden" : ""}`}
        >
          {child}
        </div>
      ))}
      {filled.length > 1 && (
        <button
          type="button"
          aria-label={t("notices.next")}
          onClick={() => {
            const at = filled.indexOf(active ?? -1);
            setPicked(filled[(at + 1) % filled.length]);
          }}
          className="mt-1 flex min-h-8 items-center gap-1.5 px-4"
        >
          {filled.map((i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full ${i === active ? "bg-zinc-900" : "bg-zinc-300"}`}
            />
          ))}
        </button>
      )}
    </div>
  );
}
