/**
 * image.ts — image serving from blob store or target path.
 */

import { isImageExt } from "../contenttype.ts";
import { resolve } from "../waggle.ts";

/** Serve an image from a standalone token (reads from blob store). */
export async function serveTokenImage(
  token: string,
  raw: boolean,
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  try {
    const info = await resolve(token);
    const ct = info.contentType;
    if (!ct.startsWith("image/")) return null;

    // Try to get bytes from the target path
    if (info.target.startsWith("file://")) {
      const filePath = info.target.replace(/^file:\/\//, "");
      const bytes = await Bun.file(filePath).arrayBuffer();
      return { bytes, contentType: ct };
    }
  } catch {
    // fall through
  }
  return null;
}

/** Serve an image file from a folder token (reads from target path). */
export async function serveFolderImage(
  token: string,
  fileName: string,
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const fileExt = fileName.split(".").pop()?.toLowerCase() ?? "";
  const imageType = isImageExt(fileExt);
  if (!imageType) return null;

  try {
    const info = await resolve(token);
    const folderPath = info.target.replace(/^file:\/\//, "");
    const filePath = `${folderPath}/${fileName}`;
    const bytes = await Bun.file(filePath).arrayBuffer();
    return { bytes, contentType: imageType };
  } catch {
    return null;
  }
}
