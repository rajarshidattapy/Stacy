import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id || !/^[a-z0-9-]+$/i.test(id)) {
    return NextResponse.json({ error: "Invalid theme id" }, { status: 400 });
  }

  const themesRoot = path.join(process.cwd(), "lib/monacoThemes");
  const themeListPath = path.join(themesRoot, "themelist.json");

  if (!fs.existsSync(themeListPath)) {
    return NextResponse.json({ error: "Theme list not found" }, { status: 404 });
  }

  const themeList = JSON.parse(fs.readFileSync(themeListPath, "utf-8")) as Record<string, string>;
  const themeName = themeList[id];

  if (!themeName) {
    return NextResponse.json({ error: "Theme not found" }, { status: 404 });
  }

  const themePath = path.join(themesRoot, `${themeName}.json`);
  const relativePath = path.relative(themesRoot, themePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath) || !fs.existsSync(themePath)) {
    return NextResponse.json({ error: "Theme file not found" }, { status: 404 });
  }

  return NextResponse.json(JSON.parse(fs.readFileSync(themePath, "utf-8")));
}
