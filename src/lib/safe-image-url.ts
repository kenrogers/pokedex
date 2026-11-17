/**
 * Only PokéAPI sprite URLs, or a drawing as a data: or blob: image, may be used as a card picture.
 */
const SPRITE_HOST = "raw.githubusercontent.com";
const SPRITE_PATH = "/PokeAPI/sprites/";
const DATA_IMAGE = /^data:image\/(png|jpeg|webp);base64,/i;
const DATA_IMAGE_RAW = /^data:image\/(png|jpeg|webp),/i;
const ENCODED_SLASH = /%2f|%5c/i;

export function isSafeCardImageUrl(url: string): boolean {
  if (url.startsWith("blob:")) return true;
  if (DATA_IMAGE.test(url) || DATA_IMAGE_RAW.test(url)) return true;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (u.username || u.password) return false;
    if (u.hostname !== SPRITE_HOST) return false;
    const path = resolveSafePath(u.pathname);
    return path !== null && (path === "/PokeAPI/sprites" || path.startsWith(SPRITE_PATH));
  } catch {
    return false;
  }
}

/** Decode (including nested encodings), reject encoded slashes/backslashes, then resolve . and .. */
function resolveSafePath(pathname: string): string | null {
  let current = pathname;
  for (let i = 0; i < 8; i++) {
    if (current.includes("\\") || ENCODED_SLASH.test(current)) return null;
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      return null;
    }
    if (next === current) break;
    current = next;
    if (i === 7) return null;
  }
  if (current.includes("\\") || ENCODED_SLASH.test(current)) return null;

  const out: string[] = [];
  for (const seg of current.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (!out.length) return null;
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return "/" + out.join("/");
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
