/**
 * Tiny checks for isSafeCardImageUrl. Run: npm run test:urls
 */
import { isSafeCardImageUrl, safeCardImageUrl, artworkFor } from "../src/lib/safe-image-url.ts";

const ok = (url: string) => {
  if (!isSafeCardImageUrl(url)) throw new Error(`expected allow: ${url}`);
};
const no = (url: string) => {
  if (isSafeCardImageUrl(url)) throw new Error(`expected deny: ${url}`);
};

ok("https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png");
ok("https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/10036.png");
ok("https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/25.png");
ok("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");
ok("data:image/jpeg;base64,/9j/");
ok("data:image/webp;base64,UklGRg==");
ok("blob:https://example.com/11111111-1111-1111-1111-111111111111");

no("https://raw.githubusercontent.com/PokeAPI/sprites/..%2fevil/x.png");
no("https://raw.githubusercontent.com/PokeAPI/sprites/%2e%2e%2fevil/x.png");
no("https://raw.githubusercontent.com/PokeAPI/sprites/%252e%252e%252fevil/x.png");
no("https://raw.githubusercontent.com/PokeAPI/sprites/master/%2e%2e/%2e%2e/evil/x.png");
no("https://raw.githubusercontent.com/PokeAPI/sprites/foo/../../evil/x.png");
no("https://raw.githubusercontent.com/PokeAPI/sprites/..%5cevil/x.png");
no("javascript:alert(1)");
no("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=");
no("data:text/html;base64,PHNjcmlwdD4=");
no("https://evil.example/PokeAPI/sprites/master/x.png");
no("https://raw.githubusercontent.com.evil.com/PokeAPI/sprites/master/x.png");
no("http://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png");
no("https://user:pass@raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png");
no("https://raw.githubusercontent.com/other/repo/master/x.png");

if (safeCardImageUrl("https://evil.example/x.png", 25) !== artworkFor(25)) {
  throw new Error("unsafe URL should fall back to artwork");
}

console.log("safe-image-url: all checks passed");
