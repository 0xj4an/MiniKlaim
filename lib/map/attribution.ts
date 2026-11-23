/**
 * Fold the map credit into its "i" button a few seconds after the map shows.
 *
 * MapLibre folds a compact credit only when the player drags the map. On the
 * run screen the map follows the player and nobody drags it, so the whole
 * line sat across the bottom of the map, under the Finish button, for the
 * length of the run. The profile's small map had it over a quarter of its
 * height.
 *
 * OpenStreetMap's attribution guidelines let the credit collapse five
 * seconds after the map is displayed, which is what this does. It stays one
 * tap away on the "i".
 */
export const ATTRIBUTION_FOLD_MS = 5000;

/** The part of an element this needs, so it can be tested without a DOM. */
type CreditHost = {
  querySelector(selector: string): {
    removeAttribute(name: string): void;
    classList: { remove(name: string): void };
  } | null;
};

export function foldAttribution(container: CreditHost): boolean {
  const el = container.querySelector(
    ".maplibregl-ctrl-attrib.maplibregl-compact-show",
  );
  if (!el) return false;
  el.removeAttribute("open");
  el.classList.remove("maplibregl-compact-show");
  return true;
}

export function foldAttributionLater(
  map: { getContainer(): CreditHost },
  ms: number = ATTRIBUTION_FOLD_MS,
): () => void {
  const id = setTimeout(() => {
    try {
      foldAttribution(map.getContainer());
    } catch {
      // The map was removed before the timer ran. Nothing to fold.
    }
  }, ms);
  return () => clearTimeout(id);
}
