# WO-09a — Connect the fal MCP server and document reconnection

## Goal

Prove the `fal` MCP server in `.vscode/mcp.json` authenticates and answers a read-only
call, and write down how to get back to that state after the OAuth token expires.

No image may be generated in this order. No image endpoint is chosen in this order.

## Context

`.vscode/mcp.json` already declares two servers: `fal` (`https://mcp.fal.ai/mcp-relay`)
and `fal-docs`. The relay authenticates with OAuth through the editor. There is no
`FAL_KEY` in this project and there must never be one.

Split from WO-09 so that "the connection works" and "the model is pinned" are reviewed
separately. WO-09b does the pricing and schema work.

## Files (whitelist)

- `.vscode/mcp.json`
- `docs/MCP_SETUP.md` (new)
- `README.md`

## Steps

1. Start the `fal` server from `.vscode/mcp.json`, complete the OAuth browser sign-in, and
   enable its tools. Do not paste any token or key into a file or a chat message.
2. Call `search_models` with `query: "flux-3"` and once more with
   `category: "text-to-image"`. A non-empty result set is the connection check. Do **not**
   call `run_model`.
3. Write `docs/MCP_SETUP.md` covering:
   - how to reconnect after a token expiry (restart the server, re-run OAuth, re-enable tools);
   - the health check is `search_models` only — nothing that spends budget;
   - the project needs no API key and no credential may ever be committed;
   - the current state: connection verified, endpoint not yet pinned (WO-09b).
4. Add one short pointer to `docs/MCP_SETUP.md` from `README.md`, next to any existing
   asset-pipeline section.

## Acceptance criteria

- [ ] `search_models` returns results for both calls, and `npm run art:status` still shows `0/80`.
- [ ] `docs/MCP_SETUP.md` exists and answers: reconnect after expiry, verify with
      `search_models` only, no API key required.
- [ ] `README.md` links to `docs/MCP_SETUP.md`.
- [ ] No file touched by this order contains a credential, token, or OAuth code.
- [ ] `pipeline/registry/model.json` is unchanged and still `unresolved`.

## Verification

```bash
npm run art:status
grep -rniE "fal[_-]?key|bearer |oauth2/access|refresh_token" .vscode docs/MCP_SETUP.md README.md || echo "no credentials found"
npm run typecheck
```

## Out of scope

- Generating any image.
- Choosing an endpoint, editing `pipeline/registry/model.json`, or writing `schema.json`.
- Changing prompts, slots, or the budget ceiling.
