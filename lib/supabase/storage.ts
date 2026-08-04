/**
 * Public URL for a figure.
 *
 * questions.figure_url holds a Storage path like "figures/2025/q022_p016.png".
 * The bucket is public, so this is a plain URL with no round trip - a signed URL
 * per question would cost a request on a connection that may barely have one.
 */
export function figureUrl(storagePath: string | null): string | null {
  if (!storagePath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${storagePath.replace(/^\/+/, "")}`;
}
