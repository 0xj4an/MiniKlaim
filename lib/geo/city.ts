import { cellToLatLng } from "h3-js";
import { createLogger } from "@/lib/logger";

const log = createLogger("geo:city");

/**
 * City name for an H3 cell's centroid, or null when it cannot be resolved
 * (e.g. open ocean, remote areas, or resolution failure).
 * 
 * For now, returns null - city resolution to be implemented with proper
 * geocoding service or offline database.
 */
export function cityForHex(h3Id: string): string | null {
  try {
    const [lat, lng] = cellToLatLng(h3Id);
    // TODO: Implement city lookup from lat/lng
    // Options: offline database (world-cities npm package) or geocoding API
    log.debug("city resolution pending", { h3Id, lat, lng });
    return null;
  } catch (e) {
    log.warn("city resolution failed", {
      h3Id,
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
