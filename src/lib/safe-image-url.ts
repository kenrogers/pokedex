/**
 * Only PokéAPI sprite URLs, or a drawing as a data: or blob: image, may be used as a card picture.
 */
const SPRITE_HOST = "raw.githubusercontent.com";
const SPRITE_PATH = "/PokeAPI/sprites/";
const DATA_IMAGE = /^data:image\/(png|jpeg|webp);base64,/i;
const DATA_IMAGE_RAW = /^data:image\/(png|jpeg|webp),/i;

export function isSafeCardImageUrl(url: string): boolean {
  if (url.startsWith("blob:")) return true;
  if (DATA_IMAGE.test(url) || DATA_IMAGE_RAW.test(url)) return true;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (u.username || u.password) return false;
    if (u.hostname !== SPRITE_HOST) return false;
    return u.pathname.startsWith(SPRITE_PATH);
  } catch {
    return false;
  }
}

export function artworkFor(number: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${number}.png`;
}

/** Use the given URL only if it is on the allowlist; otherwise official artwork (or empty). */
export function safeCardImageUrl(url: string | undefined, number?: number): string {
  if (url && isSafeCardImageUrl(url)) return url;
  if (typeof number === "number" && Number.isFinite(number) && number > 0) return artworkFor(number);
  return "";
}
