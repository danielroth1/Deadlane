# fal MCP server setup

The asset pipeline talks to fal through the MCP server declared in
[`.vscode/mcp.json`](../.vscode/mcp.json). The game never talks to it — the shipped
bundle makes no network calls at all.

| Server | URL | Purpose |
| --- | --- | --- |
| `fal` | `https://mcp.fal.ai/mcp-relay` | catalogue, pricing, generation |
| `fal-docs` | `https://fal.ai/docs/mcp` | read-only endpoint documentation |

`fal` is an HTTP server authenticated by OAuth through the editor. The relay holds the
credential; the project only declares the URL. `fal-docs` is a separate read-only
documentation server; nothing here claims it is OAuth-authenticated.

## No API key, ever

This project needs **no API key and no credential file**. Authentication happens in the
editor, outside the repository. Nothing that could be used to bill the account may be
committed, pasted into a prompt, or written into a document — not in `.vscode/`, not in
`pipeline/`, not in chat. There is no environment variable for this and there must never
be one.

If a tool asks you for a key, stop: you are on the wrong server or the wrong flow.

## Reconnecting after the token expires

The OAuth session is a time-limited credential held by the editor, not by the repo. When
it expires, calls fail with an auth error. Recovery is entirely editor-side:

1. Open the MCP view, select the `fal` server, and stop it.
2. Start it again. The editor prompts for sign-in and opens the browser.
3. Complete the fal sign-in flow in the browser and return to the editor.
4. Re-enable the server's tools if the editor has disabled them after the failure.
5. Confirm the connection with the health check below.

`fal-docs` is unauthenticated and needs no recovery step.

## Health check

The health check is **`search_models` only** — a read-only catalogue query. It spends
nothing and reserves no budget.

```text
search_models(query: "flux-3", limit: 5)
search_models(category: "text-to-image", limit: 10)
```

A non-empty result set means the relay authenticated and is answering. Anything that
reserves budget or produces an image is **not** a health check — that is a purchase, and
it requires `npm run art:claim` first. See [`pipeline/BUDGET.md`](../pipeline/BUDGET.md).
`run_model` is never part of a connection test.

### Fallback if `search_models` is unavailable

If the tool picker shows `search_models` disabled, use `browse_models` on the same
server instead. It is equally read-only, and a non-empty catalogue page from it is the
same connection proof. Re-enable `search_models` when it comes back; nothing else in this
document depends on which of the two answered.

### Verification evidence

These are the exact calls that were run against the connected `fal` relay, with the
result counts they actually returned.

| Call | Tool | Exact arguments | Result |
| --- | --- | --- | --- |
| 1 | `search_models` | `query: "flux-3"`, `limit: 5` | `total_shown: 5`, `has_more: true`, no `recommended_count` |
| 2 | `search_models` | `category: "text-to-image"`, `limit: 10` | `total_shown: 10`, `has_more: true`, `recommended_count: 5` |

Counts are quoted as `total_shown`, not `limit`: `search_models` can return more entries
than the requested `limit` because recommended picks are pinned into the page.

Call 1 endpoints:

- `blackforestlabs/flux-3-max/image-to-video`
- `blackforestlabs/flux-3/edit-image`
- `blackforestlabs/flux-3-max/text-to-video`
- `blackforestlabs/flux-3/klein/edit-image/lora` (caveat: `lora_variant`)
- `blackforestlabs/flux-3/klein/text-to-image/lora` (caveat: `lora_variant`)

Call 2 endpoints:

- `google/nano-banana-2.1`
- `fal-ai/nano-banana-pro`
- `openai/gpt-image-2`
- `openai/gpt-image-2.5/flare/text-to-image`
- `fal-ai/flux-2-pro`
- `fal-ai/flux/schnell`
- `fal-ai/flux/dev`
- `openai/gpt-image-2.5/sunburst/text-to-image`
- `fal-ai/nano-banana-2` (caveat: superseded)
- `fal-ai/nano-banana` (caveat: superseded)

Both calls returned non-empty pages and the reply footer resolved to the named fal
account `Daniel Roth`. No `run_model` call was made, no claim was taken, and the ledger
still reads `0/150`.

## Current state

| Item | State |
| --- | --- |
| `fal` connection | **verified** — authenticated, account `Daniel Roth` resolves, `search_models` answers |
| Tools | `search_models` enabled and callable in this editor (`browse_models` documented as fallback) |
| Health check performed | 2 × `search_models` (name search + category browse), both non-empty |
| Image endpoint | **not yet pinned** — pricing and schema work is WO-09b |
| `pipeline/registry/model.json` | still `unresolved` |
| Budget spent | 0 / 80 |

Connecting is complete; choosing an endpoint is not. WO-09b pins the model in
`pipeline/registry/model.json` and records its cached schema.
