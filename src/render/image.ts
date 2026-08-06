/**
 * image.ts — image serving from waggle blob store.
 *
 * Reads image bytes from the content-addressed blob store (~/.waggle/blobs/),
 * NOT from the filesystem target path. This means images work on any machine
 * that has the waggle store, even if the original file was moved or deleted.
 *
 * For folder tokens: reads the dirindex blob to find the file's sha256,
 * then reads the file's blob.
 * For standalone tokens: reads the manifest to find the blob ref.
 */

import { isImageExt } from "../contenttype.ts";
import { resolve, blobPath } from "../waggle.ts";
import { $ } from "bun";
import { existsSync } from "node:fs";

interface BlobRef {
  sha256: string;
  contentType: string;
}

/** Read the dirindex blob for a folder token, find a file's blob ref. */
async function findFileBlobRef(token: string, fileName: string): Promise<BlobRef | null> {
  try {
    // Query the manifest for the tree index (dirindex blob sha256)
    const bin = process.env.WAGGLE_BIN ?? "waggle";
    const result = await $`${bin} query --token ${token} --path /manifest/tree/index`.quiet();
    const json = JSON.parse(result.stdout.toString());
    const indexSha = json.result?.slice?.sha256;
    if (!indexSha) return null;

    // Read the dirindex blob
    const indexPath = blobPath(indexSha);
    if (!existsSync(indexPath)) return null;
    const indexData = JSON.parse(await Bun.file(indexPath).text());

    // Find the file entry
    for (const entry of indexData.entries ?? []) {
      if (entry.kind === "file" && entry.name === fileName) {
        return { sha256: entry.sha256, contentType: entry.content_type };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Read bytes from the blob store by sha256. */
async function readBlob(sha256: string): Promise<ArrayBuffer | null> {
  const path = blobPath(sha256);
  if (!existsSync(path)) return null;
  return await Bun.file(path).arrayBuffer();
}

/** Serve an image from a standalone token (reads from blob store). */
export async function serveTokenImage(
  token: string,
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  try {
    const info = await resolve(token);
    if (!info.contentType.startsWith("image/")) return null;

    // Query the manifest for the content blob ref (the actual image bytes)
    const bin = process.env.WAGGLE_BIN ?? "waggle";
    const result = await $`${bin} query --token ${token} --path /manifest/content`.quiet();
    const json = JSON.parse(result.stdout.toString());
    const contentSha = json.result?.slice?.sha256;
    if (contentSha) {
      const bytes = await readBlob(contentSha);
      if (bytes) return { bytes, contentType: info.contentType };
    }

    // Fallback: try variants (older manifest schema)
    const variantsResult = await $`${bin} query --token ${token} --path /manifest/variants`.quiet();
    const variantsJson = JSON.parse(variantsResult.stdout.toString());
    const variants = variantsJson.result?.slice ?? [];
    for (const v of variants) {
      const sha = v.body?.inline?.sha256 ?? v.body?.snapshot?.sha256;
      if (sha) {
        const bytes = await readBlob(sha);
        if (bytes) return { bytes, contentType: info.contentType };
      }
    }

    // Fallback: try target path (works if file still exists locally)
    if (info.target.startsWith("file://")) {
      const filePath = info.target.replace(/^file:\/\//, "");
      if (existsSync(filePath)) {
        const bytes = await Bun.file(filePath).arrayBuffer();
        return { bytes, contentType: info.contentType };
      }
    }
  } catch {
    // fall through
  }
  return null;
}

/** Serve an image file from a folder token (reads from blob store). */
export async function serveFolderImage(
  token: string,
  fileName: string,
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const fileExt = fileName.split(".").pop()?.toLowerCase() ?? "";
  const imageType = isImageExt(fileExt);
  if (!imageType) return null;

  // Try blob store first (content-addressed, works anywhere)
  const blobRef = await findFileBlobRef(token, fileName);
  if (blobRef) {
    const bytes = await readBlob(blobRef.sha256);
    if (bytes) return { bytes, contentType: blobRef.contentType };
  }

  // Fallback: try target path (works if file still exists locally)
  try {
    const info = await resolve(token);
    if (info.target.startsWith("file://")) {
      const folderPath = info.target.replace(/^file:\/\//, "");
      const filePath = `${folderPath}/${fileName}`;
      if (existsSync(filePath)) {
        const bytes = await Bun.file(filePath).arrayBuffer();
        return { bytes, contentType: imageType };
      }
    }
  } catch {
    // give up
  }
  return null;
}
