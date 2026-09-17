import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ folder: string }> },
) {
  const { folder } = await params;
  const { searchParams } = new URL(request.url);
  const requestedPath = searchParams.get("path");

  if (!requestedPath || requestedPath.includes("..")) {
    return NextResponse.json({ error: "Invalid asset path" }, { status: 400 });
  }

  const extensionsRoot = path.join(process.cwd(), "components/ide/extensions");
  const filePath = path.join(extensionsRoot, folder, requestedPath);
  const relativePath = path.relative(path.join(extensionsRoot, folder), filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath) || !fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = CONTENT_TYPES[extension] ?? "application/octet-stream";

  return new NextResponse(fs.readFileSync(filePath), {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=3600",
    },
  });
}
