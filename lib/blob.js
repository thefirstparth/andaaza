// Vercel Blob for thumbs. Works with either connection style: the newer one (BLOB_STORE_ID, authenticated by the
// function's OIDC token) or the older BLOB_READ_WRITE_TOKEN. Stores may be private or public; votes are written
// private when the store allows it.
export const blobConfigured = () => Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);

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
