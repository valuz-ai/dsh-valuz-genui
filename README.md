# dsh-valuz-genui

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that gives the model a `generate_ui` tool: a natural-language request (plus optional data) becomes an [A2UI](https://a2ui.org) v0.9.1 document rendered as an **interactive surface inline in the chat** — charts, KPI cards, tables, forms, dashboards — that the user can click, and whose interactions come back to the model.

The UI is compiled by the model itself, through **the harness's own model** (`ctx.llm`) — no separate API key or provider config. It is a dsh host adapter over the provider-agnostic [valuz-genui](https://github.com/valuz-ai/valuz-genui) core (76-component A2UI catalog, streaming generation loop, React renderer); the Vercel-AI-SDK server in that repo is just another host.

> Status: Phase 1 MVP. The surface renders when generation completes (the tool shows a pending card while it runs); live token-by-token streaming into the chat is deferred — see [Known Limitations](#known-limitations-and-deferred-work).

## Install

Into an existing profile that already has a model configured:

```sh
dsh plugin --profile web add github:valuz-ai/dsh-valuz-genui#<commit-sha>
```

pnpm ≥ 10 blocks a git dependency's `prepare` build until you allow it; the first `add` fails and prints the exact key to copy into the profile's `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  'dsh-valuz-genui@https://codeload.github.com/valuz-ai/dsh-valuz-genui/tar.gz/<commit-sha>': true
```

Re-run the `add`, then restart `dsh web` and hard-refresh. Ask the model for a chart or dashboard to verify. `dsh plugin` prints "missing peer" warnings for the `@deepseek-ai/*` packages — expected; the dsh installation supplies them at runtime.

**No extra configuration is needed.** Generation follows the session's currently selected model. Set `provider`/`model` in the plugin config only to pin a different (e.g. cheaper) model for UI generation.

### Local development

The plugin references the `valuz-genui` sources next to it (`../valuz-genui`), inlined at build time. From a checkout:

```sh
git clone https://github.com/valuz-ai/valuz-genui.git
git clone https://github.com/valuz-ai/dsh-valuz-genui.git
cd dsh-valuz-genui && pnpm install && pnpm run check
```

Then boot the harness with a `--patch` overlay that inserts the built entry by absolute path:

```yaml
- insert:
    - id: genui
      name: '/absolute/path/to/dsh-valuz-genui/lib/index.js'
```

```sh
pnpm dsh web --patch /absolute/path/to/genui.patch.yml
```

## The tool

`generate_ui(request, data?, component_names?, edit_surface_id?)`

- `request` — natural-language description of the UI: hierarchy, data relationships, interactions. No colors or CSS (the host owns the theme).
- `data` — a JSON object of the concrete values to present.
- `component_names` — optional exact component set to restrict the compiler to (the structural root is added automatically).
- `edit_surface_id` — to revise an existing surface, the id of the earlier call; its document is loaded and edited rather than rebuilt.

The model receives a short receipt (surface id + component types); the document itself is rendered to the user and never repeated as chat text. When the user interacts with a surface, the model receives a `<ui_action surface="…" component="…" name="…">{context}</ui_action>` message and can answer in text or call `generate_ui` again with `edit_surface_id`.

## Configuration

Override the `genui` row by id in your profile's `cordis.patch.yml` (a patch replaces the whole `config`):

| Key | Default | Meaning |
|---|---|---|
| `provider` / `model` | (session model) | Pin a model for UI generation. Set both or neither. |
| `maxOutputTokens` | 16384 | Output-token budget per generation turn. |
| `maxContinuations` | 3 | Continuations when a turn is cut off mid-document. |
| `maxAttempts` | 2 | Whole-generation retries on blank/failed/no-document output. |
| `temperature` | (provider default) | Sampling temperature. |
| `maxDataBytes` | 131072 | Byte cap on the `data` argument. |

## How it works

- **Host half** (`lib/index.js`): registers `generate_ui` on `ctx.tools` and a guidance section on `ctx.systemPrompt`. Inside the tool, a `DshStreamer` drives the valuz generation loop over `ctx.llm.stream()`; the finished A2UI document, component names, warnings, and route ride in `tool/result.meta` (durable, replayed, unbounded), while the model-facing content is a one-line summary that never spills.
- **Client half** (`lib/client.js`): a `ConversationNodeDefinition` matches those tool results and a keyed `conversation.chat.node` renderer draws the document with the valuz `<A2UIRenderer>`, following the host light/dark theme. Interactions are sent back through `conversation.send` as an ordinary user message (model-visible ⟺ logged).

## Known Limitations and Deferred Work

- **No live streaming into the chat yet.** dsh's session log refuses unknown event types unless they are marked `ignorable`, and the append API has no way to set that flag today, so this plugin persists only through `tool/result.meta` and renders when the call completes. Token-by-token rendering needs either an `ignorable` append path in the host (proposed upstream) or a plugin-owned SSE channel.
- **Client bundle is large (~3.5 MB).** recharts, the A2UI renderer, and markdown-it are inlined. Phase 2 splits the heavy chart engine into a lazily loaded, plugin-served asset (as prior genui plugins do).
- **Theme bridge is coarse.** The renderer follows light/dark but does not yet map A2UI `--va2-*` tokens onto the host `--dsw-alias-*` scale.
- **`@valuz-genui/*` are not yet published;** they are vendored from the sibling checkout and inlined at build time.

## License

MIT
