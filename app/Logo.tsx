/**
 * MiniKlaim logo. A pointy-top hexagon (matches H3 cell visual) filled in
 * brand orange with the "MK" wordmark inside. The same shape is used for
 * /icon, /icon-192.png, /icon-512.png, /apple-icon, /splash.png so favicon, splash, OG and
 * in-page heading all read the same.
 */

const BRAND = "#FF6B35";

type LogoMarkProps = {
  size?: number;
  className?: string;
  /** "white" is the mark on the orange band: a white block, orange letters. */
  variant?: "solid" | "outline" | "white";
};

export function LogoMark({
  size = 32,
  className,
  variant = "solid",
}: LogoMarkProps) {
  const fill =
    variant === "solid" ? BRAND : variant === "white" ? "#ffffff" : "none";
  const stroke = BRAND;
  const text =
    variant === "solid" ? "#ffffff" : variant === "white" ? "#e64a12" : BRAND;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <polygon
        points="50,5 89,27.5 89,72.5 50,95 11,72.5 11,27.5"
        fill={fill}
        stroke={stroke}
        strokeWidth={variant === "outline" ? 6 : 0}
        strokeLinejoin="round"
      />
      <text
        x="50"
        y="65"
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto"
        fontSize="42"
        fontWeight="800"
        letterSpacing="-2"
        fill={text}
      >
        MK
      </text>
    </svg>
  );
}

type WordmarkProps = {
  height?: number;
  className?: string;
  /** "white" for the orange band. */
  tone?: "ink" | "white";
};

export function LogoWordmark({
  height = 40,
  className,
  tone = "ink",
}: WordmarkProps) {
  // Hex + "MiniKlaim" side by side. Hex height matches text cap height.
  return (
    <div
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: height * 0.25 }}
    >
      <LogoMark size={height} variant={tone === "white" ? "white" : "solid"} />
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          letterSpacing: 0,
          fontSize: height * 1.12,
          lineHeight: 1,
          color: tone === "white" ? "#ffffff" : "#141a22",
        }}
      >
        MiniKlaim
      </span>
    </div>
  );
}
