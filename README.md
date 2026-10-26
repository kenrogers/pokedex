# DEX Open — a talking Pokédex

Hold to talk, ask about any Pokémon, and DEX answers out loud with a Pokédex screen: types, forms (megas, regional forms), shiny art, evolutions, type match-ups and step-by-step drawings.

It is a static web app. Everything runs in your browser. The only cost is your own [OpenRouter](https://openrouter.ai) usage (a few tenths of a cent per question).

## 1. Deploy (static, bring your own key)

Each visitor signs in with OpenRouter (or pastes an OpenRouter key). Their key stays in their browser and is sent only to `openrouter.ai`. You host static files only, so hosting is free and you pay nothing for other people's use.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/OWNER/dex-open)

Or by hand:

```bash
npm install
npm run build        # outputs dist/
npx wrangler deploy  # Cloudflare Workers static assets (free plan)
```

**Netlify:** build command `npm run build`, publish directory `dist`. `public/_headers` (security headers + CSP) is picked up automatically. Add a `/* /index.html 200` rule in `public/_redirects` if you want deep links.

**GitHub Pages:** publish `dist/` with any Pages action. Pages ignores `_headers`, so copy the `Content-Security-Policy` line from `public/_headers` into a `<meta http-equiv="Content-Security-Policy">` tag in `index.html` (drop `frame-ancestors`, which meta tags don't support).

Node 22+ is required for Wrangler.

### Signing in

- **Sign in with OpenRouter** (default) uses OAuth PKCE. No key is copied by hand.
- **Paste a key** works too. Make a key with a credit limit at openrouter.ai/keys.
- The key is kept in `sessionStorage` (cleared when the tab closes). Tick **Remember me on this device** to keep it in `localStorage` instead. "Forget key" removes it.

## 2. Private deploy with your own key

For family or a classroom, where people shouldn't need an OpenRouter account. A small Worker adds your key on the server. It is locked with a password and rate limited, and it only allows the configured models.

```bash
npx wrangler secret put OPENROUTER_API_KEY -c wrangler.private.jsonc
npx wrangler secret put ACCESS_PASSWORD   -c wrangler.private.jsonc
npm run deploy:private   # builds with VITE_SERVER_PROXY=1
```

Share `https://<your-worker>/?key=<password>` once per device. The password is saved on that device.

The Worker only forwards requests, which keeps it well under the free plan's 10 ms CPU limit. The free plan allows 100,000 requests a day. Set a credit limit on the key you use here.

## Settings

Models are set in `.env` (see `.env.example`): chat, speech-to-text, text-to-speech, voice and image model. Limits (tool rounds, tokens, drawings per question) are in `src/core/config.ts`.

## Security

- No server holds user keys in the default deploy.
- Strict CSP: scripts from the same origin only, network calls only to `openrouter.ai` and `graphql.pokeapi.co`, no third-party scripts.
- Model output is never rendered as raw HTML.
- No secrets in the repo. `.env*` and `.dev.vars` are git-ignored.

## Layout

- `src/core/`: chat loop, tools (`lookup_pokemon`, `compare_types`, `draw`), system prompt, limits, OpenRouter client, key handling. All run in the browser.
- `src/`: React UI.
- `worker/`: optional proxy for the private deploy.

Pokémon data comes from [PokéAPI](https://pokeapi.co). This is a fan project and is not affiliated with Nintendo, Game Freak, The Pokémon Company or PokéAPI.

## License

MIT
