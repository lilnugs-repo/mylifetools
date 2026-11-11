// Private Vercel Blob storage: one JSON file per tool.
// On Vercel the SDK authenticates automatically once the store is connected
// to the project. Locally (vercel dev) it uses BLOB_READ_WRITE_TOKEN from .env.local.
import { get, put } from "@vercel/blob";

const PREFIX = "my-tools/";

export async function readJSON(path) {
  let r;
  try {
    // useCache: false → always the latest write (cached reads can lag ~60s after an overwrite)
    r = await get(PREFIX + path, { access: "private", useCache: false });
  } catch (e) {
    if (e?.name === "BlobNotFoundError" || /not.?found/i.test(e?.message ?? "")) return null;
    throw e;
  }
  if (!r || r.statusCode !== 200) return null;
  return JSON.parse(await new Response(r.stream).text());
}

export async function writeJSON(path, data) {
  await put(PREFIX + path, JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}
