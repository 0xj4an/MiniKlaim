import { NextResponse } from "next/server";
import { cityForHex } from "@/lib/geo/city";

export const dynamic = "force-dynamic";

const ADMIN_SECRET = process.env.ADMIN_SECRET || "change-me-in-production";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const providedSecret = authHeader?.replace("Bearer ", "");

    if (providedSecret !== ADMIN_SECRET) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Test city resolution with known coordinates
    const testCases = [
      { h3: "8544e34d89fffff", country: "COL", expected: "Bogotá" }, // Bogotá
      { h3: "85283473fffffff", country: "MEX", expected: "Mexico City" }, // CDMX
      { h3: "8428309bfffffff", country: "USA", expected: "San Francisco" }, // SF
    ];

    const results = [];
    let citiesLoaded = false;
    let loadError = null;
    
    // Check filesystem paths
    const { existsSync, readdirSync } = await import("fs");
    const { join } = await import("path");
    
    const pathsToCheck = [
      process.cwd(),
      "/ROOT",
      join(process.cwd(), "node_modules"),
      join(process.cwd(), "node_modules", "all-the-cities"),
      "/ROOT/node_modules",
      "/ROOT/node_modules/all-the-cities",
      process.cwd() + "/.next",
      process.cwd() + "/.next/server",
    ];
    
    const pathInfo: Record<string, { exists?: boolean; files?: string[]; error?: string }> = {};
    for (const path of pathsToCheck) {
      try {
        const exists = existsSync(path);
        if (exists) {
          const files = readdirSync(path).slice(0, 10);
          pathInfo[path] = { exists: true, files };
        } else {
          pathInfo[path] = { exists: false };
        }
      } catch (e) {
        pathInfo[path] = { error: e instanceof Error ? e.message : String(e) };
      }
    }

    try {
      const allTheCities = await import("all-the-cities");
      const cities = allTheCities.default;
      citiesLoaded = Array.isArray(cities) && cities.length > 0;
      results.push({
        test: "Load cities database",
        success: citiesLoaded,
        citiesCount: cities.length,
        sampleCity: cities[0]?.name,
      });
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
      results.push({
        test: "Load cities database",
        success: false,
        error: loadError,
        stack: e instanceof Error ? e.stack : undefined,
      });
    }

    for (const testCase of testCases) {
      try {
        const city = cityForHex(testCase.h3, testCase.country);
        results.push({
          test: `Resolve ${testCase.expected}`,
          h3: testCase.h3,
          country: testCase.country,
          expected: testCase.expected,
          actual: city,
          success: city !== null,
        });
      } catch (e) {
        results.push({
          test: `Resolve ${testCase.expected}`,
          error: e instanceof Error ? e.message : String(e),
          success: false,
        });
      }
    }

    return NextResponse.json({
      citiesLoaded,
      loadError,
      results,
      pathInfo,
      env: {
        nodeVersion: process.version,
        platform: process.platform,
        cwd: process.cwd(),
      },
    });
  } catch (error) {
    console.error("Diagnose error:", error);
    return NextResponse.json(
      { 
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
