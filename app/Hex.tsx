/**
 * The block, as the app's one ornament: small, with softened corners.
 *
 * It used to be drawn large and solid wherever it appeared (a 34 px violet
 * slab on the challenge card, a 52 px one on the raid card). 0xj4an, 23 Nov
 * 2026: "muy grandes y muy toscos". These are the fine versions: a ring with
 * a core for something that stands for a thing (the challenge, the pot), a
 * small solid one for a mark, and pips for progress.
 */
const SOLID =
  "M20.87 15.10Q20.87 17.70 18.62 19.00L13.25 22.10Q11.00 23.40 8.75 22.10L3.38 19.00Q1.13 17.70 1.13 15.10L1.13 8.90Q1.13 6.30 3.38 5.00L8.75 1.90Q11.00 0.60 13.25 1.90L18.62 5.00Q20.87 6.30 20.87 8.90Z";
const RING =
  "M19.92 14.75Q19.92 17.15 17.84 18.35L13.08 21.10Q11.00 22.30 8.92 21.10L4.16 18.35Q2.08 17.15 2.08 14.75L2.08 9.25Q2.08 6.85 4.16 5.65L8.92 2.90Q11.00 1.70 13.08 2.90L17.84 5.65Q19.92 6.85 19.92 9.25Z";
const CORE =
  "M14.98 13.10Q14.98 14.30 13.94 14.90L12.04 16.00Q11.00 16.60 9.96 16.00L8.06 14.90Q7.02 14.30 7.02 13.10L7.02 10.90Q7.02 9.70 8.06 9.10L9.96 8.00Q11.00 7.40 12.04 8.00L13.94 9.10Q14.98 9.70 14.98 10.90Z";

type Props = { className?: string };

/** A ring with a core: the challenge, the pot. Colour comes from the text colour. */
export function HexRing({ className }: Props) {
  return (
    <svg viewBox="0 0 22 24" className={className} aria-hidden focusable="false">
      <path d={RING} fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d={CORE} fill="currentColor" />
    </svg>
  );
}

/** A small solid block. */
export function HexDot({ className }: Props) {
  return (
    <svg viewBox="0 0 22 24" className={className} aria-hidden focusable="false">
      <path d={SOLID} fill="currentColor" />
    </svg>
  );
}

/** A solid block with a tick: a mission done. */
export function HexCheck({ className }: Props) {
  return (
    <svg viewBox="0 0 22 24" className={className} aria-hidden focusable="false">
      <path d={SOLID} fill="currentColor" />
      <path
        d="m6.8 12.3 2.9 2.9 5.5-5.9"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A ring with a minus: something lost. */
export function HexMinus({ className }: Props) {
  return (
    <svg viewBox="0 0 22 24" className={className} aria-hidden focusable="false">
      <path d={RING} fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M7.5 12h7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Progress as a row of pips: `on` of `n` filled. The filled colour is the
 * text colour, so the caller sets it with a text class.
 */
export function Pips({
  n,
  on,
  className = "",
  label,
}: {
  n: number;
  on: number;
  className?: string;
  /** Read out in place of the pips, e.g. "3 of 5". */
  label?: string;
}) {
  return (
    <span
      className={`flex items-center gap-[3px] ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className="mk-pip"
          style={i < on ? { background: "currentColor" } : undefined}
        />
      ))}
    </span>
  );
}
