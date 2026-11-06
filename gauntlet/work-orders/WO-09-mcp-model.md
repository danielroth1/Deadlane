# WO-09 — Connect fal MCP and pin the image model

## Goal

Establish a working, authenticated connection to the fal MCP server and record the single
image endpoint the project will use for its entire 80-image budget.

No image may be generated in this order.

## Context

`pipeline/registry/model.json` is `unresolved`, which makes `npm run art:claim` refuse to
run. That is deliberate: the endpoint id and its parameter names must be observed facts,
not guesses. The fal model pages are cookie-walled and the catalog changes, so the only
trustworthy source is the MCP server itself.

## Files (whitelist)

- `.vscode/mcp.json`
- `pipeline/registry/model.json`
- `pipeline/registry/schema.json` (new)
- `docs/MCP_SETUP.md` (new)
- `README.md`

## Steps

1. Start the `fal` server in `.vscode/mcp.json`, complete the OAuth browser sign-in, and
   enable its tools. Do not paste any token or key into a file or a chat message.
2. Call `search_models` with query `flux-3` and with `category: "text-to-image"`. Do **not**
   call `run_model`.
3. Call `get_pricing` for the flux-3 candidates plus at least three other cheap
   text-to-image endpoints (for example a "schnell" or "fast" variant). Compare the
   per-image price and pick the cheapest that can produce a square image.
4. Call `get_model_schema` for the chosen endpoint and save the raw response to
   `pipeline/registry/schema.json`.
5. Record the endpoint and its real parameter names:
   ```bash
   npm run art:model -- --endpoint <id> --count-param <name> --seed-param <name> \
     --size-param <name> --unit-price <usd>
   ```
6. Write `docs/MCP_SETUP.md` covering: how to reconnect after a token expiry, how to check
   the connection with `search_models` only, and the fact that the project needs no API key.

## Acceptance criteria

- [ ] `search_models` returns results and `npm run art:status` still shows `0/80`.
- [ ] `pipeline/registry/model.json` has `status: "resolved"` and a non-null `endpointId`.
- [ ] `params.count` names the parameter that controls **how many images one call makes**;
      every later call sets it to 1.
- [ ] `pipeline/registry/schema.json` exists and is the verbatim `get_model_schema` output.
- [ ] `npm run art:claim -- --slot art-01-style-anchor` prints a `run_model(...)` block with
      a plausible seed and exits 0.
- [ ] No file added by this order contains a credential.

## Verification

```bash
npm run art:status
npm run art:claim -- --slot art-01-style-anchor --seed 1
git checkout pipeline/budget.json   # the claim was only a dry inspection
npm run typecheck
```

Release the claim afterwards if you keep it:
`npm run art:release -- --slot art-01-style-anchor --attempt 1 --note "probe"`

## Out of scope

- Generating any image.
- Changing prompts, slots, or the budget ceiling.
