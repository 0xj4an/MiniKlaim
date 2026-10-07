import { NextResponse } from "next/server";
import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

const ADMIN_SECRET = process.env.ADMIN_SECRET || "change-me-in-production";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const providedSecret = authHeader?.replace("Bearer ", "");

    if (providedSecret !== ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cwd = process.cwd();
    const paths = {
      cwd,
      publicData: join(cwd, "public", "data"),
      publicDataCitiesPbf: join(cwd, "public", "data", "cities.pbf"),
      public: join(cwd, "public"),
    };

    const checks: Record<
      string,
      | { exists: false }
      | { exists: true; isDirectory: true; files: string[] }
      | { exists: true; isFile: true; size: number; sizeHuman: string }
      | { error: string }
    > = {};

    for (const [name, path] of Object.entries(paths)) {
      try {
        const exists = existsSync(path);
        if (exists) {
          const stats = statSync(path);
          if (stats.isDirectory()) {
            const files = readdirSync(path);
            checks[name] = {
              exists: true,
              isDirectory: true,
              files: files.slice(0, 20),
            };
          } else {
            checks[name] = {
              exists: true,
              isFile: true,
              size: stats.size,
              sizeHuman: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
            };
          }
        } else {
          checks[name] = { exists: false };
        }
      } catch (e) {
        checks[name] = {
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }

    return NextResponse.json({
      cwd: process.cwd(),
      checks,
      env: {
        nodeVersion: process.version,
        platform: process.platform,
      },
    });
  } catch (error) {
    console.error("Check file error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
