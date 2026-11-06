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
search_models(category: "text-to-image", limit: 5)
```

A non-empty result set means the relay authenticated and is answering. Anything that
reserves budget or produces an image is **not** a health check — that is a purchase, and
it requires `npm run art:claim` first. See [`pipeline/BUDGET.md`](../pipeline/BUDGET.md).
`run_model` is never part of a connection test.

### Verification evidence

These are the exact calls that were run against the connected `fal` relay:

| Tool called | Arguments | Result |
| --- | --- | --- |
| `search_models` | `query: "flux-3"`, `limit: 5` | non-empty — 5 models, `has_more: true` |
| `search_models` | `category: "text-to-image"`, `limit: 5` | non-empty — 7 models, `has_more: true` |

Both calls returned non-empty pages. The account check resolved to a named fal account.
No `run_model` call was made, no claim was taken, and the ledger still reads `0/80`.

## Current state

| Item | State |
| --- | --- |
| `fal` connection | **verified** — authenticated, account resolves, `search_models` answers |
| Tools | `search_models` enabled and callable in this editor |
| Health check performed | 2 × `search_models` (name search + category browse), both non-empty |
| Image endpoint | **not yet pinned** — pricing and schema work is WO-09b |
| `pipeline/registry/model.json` | still `unresolved` |
| Budget spent | 0 / 80 |

Connecting is complete; choosing an endpoint is not. WO-09b pins the model in
`pipeline/registry/model.json` and records its cached schema.
