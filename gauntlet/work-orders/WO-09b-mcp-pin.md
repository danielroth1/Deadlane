# WO-09b — Pin the image model and capture its schema

## Goal

Record the single image endpoint the project will use for its entire 80-image budget,
with parameter names observed from the MCP server rather than guessed.

No image may be generated in this order.

## Context

`pipeline/registry/model.json` is `unresolved`, which makes `npm run art:claim` refuse to
run. That is deliberate: the endpoint id and its parameter names must be observed facts,
not guesses. The fal model pages are cookie-walled and the catalog changes, so the only
trustworthy source is the MCP server itself.

Requires WO-09a: the `fal` server must be connected and answering `search_models`.

## Files (whitelist)

- `pipeline/registry/model.json`
- `pipeline/registry/schema.json` (new)

## Steps

1. Call `search_models` with query `flux-3` and with `category: "text-to-image"`. Do **not**
   call `run_model`.
2. Call `get_pricing` for the flux-3 candidates plus at least three other cheap
   text-to-image endpoints (for example a "schnell" or "fast" variant). Compare the
   per-image price and pick the cheapest that can produce a square image.
3. Call `get_model_schema` for the chosen endpoint and save the raw response, verbatim, to
   `pipeline/registry/schema.json`.
4. Record the endpoint and its real parameter names:
   ```bash
   npm run art:model -- --endpoint <id> --count-param <name> --seed-param <name> \
     --size-param <name> --unit-price <usd>
   ```

## Acceptance criteria

- [ ] `pipeline/registry/model.json` has `status: "resolved"` and a non-null `endpointId`.
- [ ] `params.count` names the parameter that controls **how many images one call makes**;
      every later call sets it to 1.
- [ ] `params.seed` and `params.imageSize` name real parameters from the schema.
- [ ] `pipeline/registry/schema.json` exists and is the verbatim `get_model_schema` output.
- [ ] `npm run art:claim -- --slot art-01-style-anchor` prints a `run_model(...)` block with
      a plausible seed and exits 0.
- [ ] No file added by this order contains a credential.
- [ ] `npm run art:status` still reports `0/80` images used.

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
- Editing `.vscode/mcp.json`, `docs/MCP_SETUP.md`, or `README.md` (WO-09a owns those).
- Changing prompts, slots, or the budget ceiling.
