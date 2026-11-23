/**
 * A count with its thousands grouped, in the player's language.
 *
 * Spanish does not group four-digit numbers by default ("4001" beside
 * "27.044"), which on a screen of counts reads as two formats. Grouping
 * always keeps every count in the app looking the same.
 */
export function groupNumber(n: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      // "always" is newer than this project's TypeScript lib knows. An older
      // WebView treats it as true, which is the default behaviour.
      useGrouping: "always" as unknown as boolean,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return n.toLocaleString(locale);
  }
}
