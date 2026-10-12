export const MINIKLAIM_X_URL = "https://x.com/MiniKlaim";

/** The X logo, sized to the surrounding text. */
export function XLogo({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
    </svg>
  );
}

/** Link to the project's X account. Opens outside the app. */
export function XLink({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <a
      href={MINIKLAIM_X_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 ${className}`}
    >
      <XLogo />
      <span>{label}</span>
    </a>
  );
}
