# dsh-valuz-genui

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that gives the model a `generate_ui` tool: the **model itself authors** an [A2UI](https://a2ui.org) v0.9.1 document and passes it to `generate_ui`, and the browser renders it as an **interactive surface inline in the chat** — charts, KPI cards, tables, forms, dashboards — **streaming as the model writes the call**, and whose interactions come back to the model.

There is **no nested model call**: the UI is the model's own streamed output, so it appears live (like a fenced block), costs one model turn, and can't fail with a mid-stream error from a second request. It builds on the provider-agnostic [valuz-genui](https://github.com/valuz-ai/valuz-genui) core (76-component A2UI catalog, streaming sanitizer, React renderer).

## How it works

- **Authoring guide (system prompt + skill).** The plugin teaches the model to author A2UI and deliver it by calling `generate_ui` with `messages` (the array of A2UI message objects). When the host supports skills, a compact guide (component names + purposes + message contract) is always on and the full field-signature catalog loads on demand via the `genui` skill; otherwise the full guide stays in the system prompt.
- **Streaming render.** As the model writes the `generate_ui` arguments, each `tool-call-delta` reaches the browser as an `assistant/chunk` *before the tool runs*. A conversation node folds those deltas, extracts the complete A2UI messages authored so far, and renders them with the valuz `<A2UIRenderer>` — which keeps the last good surface while the tail is still being written. So the surface builds up component by component, live.
- **Settle + replay.** When `generate_ui` executes (milliseconds — it only validates and never calls a model), it persists the canonical document to `tool/result.meta`. The node adopts that authoritative document, and the same meta re-renders the surface on reload/replay.
- **Interactions.** A click/submit on a rendered surface is sent back to the model as an ordinary user message: `<ui_action surface="…" component="…" name="…">{context}</ui_action>` (model-visible ⟺ logged). The model answers in text or calls `generate_ui` again with the updated document.

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

Re-run the `add`, then restart `dsh web` and hard-refresh. Ask the model for a chart or dashboard to verify. **No extra configuration is needed** — the model authors the UI through whatever model the session is using.

### Local development

The plugin references the sibling `valuz-genui` checkout (`../valuz-genui`), inlined at build time:

```sh
git clone https://github.com/valuz-ai/valuz-genui.git
git clone https://github.com/valuz-ai/dsh-valuz-genui.git
cd dsh-valuz-genui && pnpm install && pnpm run check
# install into a profile (rebuild lib/ first with pnpm run build)
dsh plugin --profile web add /absolute/path/to/dsh-valuz-genui
```

Restart `dsh web` and hard-refresh after each rebuild.

## The tool

`generate_ui(messages, title?)`

- `messages` — the array of A2UI v0.9.1 message objects the model authored: `createSurface` first, then `updateComponents` / `updateDataModel`; exactly one component has id `"root"`. Written as native JSON (not a stringified blob), so it streams and validates cleanly.
- `title` — optional short surface title.

The tool validates the document, pins the catalog id, drops schema-invalid components (siblings survive), and persists everything to `tool/result.meta`. The model receives a one-line receipt.

## Configuration

Override the `genui` row by id in your profile's `cordis.patch.yml`:

| Key | Default | Meaning |
|---|---|---|
| `maxDocumentBytes` | 262144 | Inclusive byte cap on the serialized A2UI document. |
| `alwaysOnFullGuide` | false | Keep the full field-signature catalog in the system prompt instead of the on-demand `genui` skill. |

## Known Limitations and Deferred Work

- **Always-on prompt cost.** Where the host supports skills (`ctx.skills`, e.g. the web profile), only a compact guide (~3.1k tokens: component names + one-line purposes + the message contract) stays always on, and the full field-signature catalog (~9k tokens) loads on demand through the `genui` skill. Where no skill capability exists (or `alwaysOnFullGuide: true`), the full guide stays in the system prompt. Both are stable prefixes (KV-cache-friendly). The model is told to load the `genui` skill before authoring; guessing fields drops components.
- **Authoring quality depends on the model.** A2UI's 76-component graph is richer — and harder to author inline — than a compact DSL. Complex dashboards may need prompt tuning; the sanitizer tolerates and drops malformed components rather than failing the whole surface.
- **Client bundle is large (~3.5 MB).** recharts, the A2UI renderer, and markdown-it are inlined. Phase 2 splits the chart engine into a lazily loaded plugin-served asset.
- **Theme bridge is coarse.** The renderer follows light/dark but does not yet map A2UI `--va2-*` tokens onto the host `--dsw-alias-*` scale.
- **`@valuz/*` are not yet published;** vendored from the sibling checkout and inlined at build time.

## License

MIT
