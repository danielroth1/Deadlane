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

The health check is a read-only catalogue query only. It spends nothing and reserves no
budget.

The tool that is actually callable in this editor is **`browse_models`**, with the
parameters `category`, `cursor` and `limit`. It takes **no** free-text `query` argument.

> **Work order / toolset mismatch.** WO-09a asks for `search_models` with
> `query: "flux-3"`. A tool by that name exists in the relay's toolset but is **disabled
> in this editor's tool settings**, so it could not be called. The name-only search for
> `flux-3` has therefore **not been performed**, and acceptance criterion 1 of WO-09a
> cannot be met literally. The category browse below is the successful equivalent.

A non-empty result set means the relay authenticated and is answering. Anything that
reserves budget or produces an image is **not** a health check — that is a purchase, and
it requires `npm run art:claim` first. See [`pipeline/BUDGET.md`](../pipeline/BUDGET.md).

### Verification evidence

These are the exact calls that were run against the connected `fal` relay:

| Tool called | Arguments | Result |
| --- | --- | --- |
| `browse_models` | `category: "text-to-image"`, `limit: 5` | non-empty — 5 models, `has_more: true` |
| `browse_models` | `category: "text-to-image"`, `limit: 3`, `cursor: "Mg"` | non-empty — 3 models |
| `search_models` | `query: "flux-3"` | **not performed** — tool disabled in this editor |

Two separate `browse_models` calls returned non-empty pages; no `search_models` call ran.
No `run_model` call was made and no claim was taken.

## Current state

| Item | State |
| --- | --- |
| `fal` connection | verified — authenticated, account resolves, catalogue queries answered |
| Tools | `browse_models` enabled and used; `search_models` present but disabled here |
| Health check performed | 2 × `browse_models` (`text-to-image`, `limit: 5` / `limit: 3` + `cursor: "Mg"`), both non-empty |
| `search_models` with `query: "flux-3"` | not performed — tool not enabled in this editor |
| Image endpoint | **not yet pinned** — pricing and schema work is WO-09b |
| `pipeline/registry/model.json` | still `unresolved` |
| Budget spent | 0 / 80 |

Known follow-up for WO-09b: `pipeline/registry/model.json` still tells the reader to run
`search_models("flux-3")`. That instruction does not match the callable toolset and must be
corrected when the model is pinned; it is out of scope for this order.
