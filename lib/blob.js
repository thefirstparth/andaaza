// Vercel Blob for the saved reading. Works with either connection style: the newer one (BLOB_STORE_ID, authenticated by the
// function's OIDC token) or the older BLOB_READ_WRITE_TOKEN. Stores may be private or public;
// JSON is written private when the store allows it.
export const blobConfigured = () => Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
// Preview deployments (a branch being tried out) share the Blob store with the live site, so they save under their own
// folder and can never overwrite what visitors see.
export const PRE = process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production" ? `${process.env.VERCEL_ENV}/` : "";

// Reads a saved JSON file by its path; null when there is none or Blob is unavailable.
export async function readPath(path) {
  try {
    const { get } = await import("@vercel/blob");
    for (const access of ["private", "public"]) {
      try { const r = await get(path, { access, useCache: false }); if (r?.stream) return await new Response(r.stream).json(); } catch {}
    }
  } catch {}
  return null;
}

export async function putJSON(pathname, obj) {
  const { put } = await import("@vercel/blob");
  const opts = { addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" };
  try { return await put(pathname, JSON.stringify(obj), { ...opts, access: "private" }); }
  catch (e) {
    if (!/public|access|private/i.test(String(e?.message))) throw e;
    return put(pathname, JSON.stringify(obj), { ...opts, access: "public" });
  }
}

export async function readJSON(blob) {
  const { get } = await import("@vercel/blob");
  for (const access of ["private", "public"]) {
    try {
      const r = await get(blob.url, { access, useCache: false });
      if (r?.stream) return await new Response(r.stream).json();
    } catch {}
  }
  const r = await fetch(blob.url);
  return r.ok ? r.json() : null;
}
