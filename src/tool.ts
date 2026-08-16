/**
 * The `generate_ui` tool. Inside `execute` it runs the valuz generation loop
 * against the harness model (`ctx.llm` via a `DshStreamer`), keeps the full
 * A2UI document out of the model's context, and hands it to the browser node
 * through `tool/result.meta`.
 * @module dsh-valuz-genui/tool
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolExecution, ToolResult } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import { GenerateUIError, TOOL_DESCRIPTION, generateUI } from '@valuz-genui/core'
import { GENUI_META_KIND, isGenuiSurfaceMeta, type GenuiSurfaceMeta } from './meta.ts'
import { resolveRoute, type ConfiguredRoute } from './route.ts'
import { createDshStreamer } from './streamer.ts'

/** Resolved generation bounds after config defaulting. */
export interface GenuiToolConfig extends ConfiguredRoute {
  maxOutputTokens: number
  maxContinuations: number
  maxAttempts: number
  temperature?: number
  maxDataBytes: number
}

/** Look up the document a prior call rendered for `surfaceId` in this session. */
function documentForSurface(exec: ToolExecution, surfaceId: string): string | undefined {
  const agent = exec.agent
  if (agent === undefined) return undefined
  let found: string | undefined
  for (const event of agent.session.events) {
    if (event.type !== 'tool/result') continue
    const meta = (event.data as { meta?: unknown }).meta
    if (isGenuiSurfaceMeta(meta) && meta.surfaceId === surfaceId) found = meta.document
  }
  return found
}

/**
 * Register `generate_ui`.
 * @param ctx - context carrying the tool registry and LLM service.
 * @param config - resolved generation bounds and optional route override.
 */
export function applyGenerateUiTool(ctx: Context, config: GenuiToolConfig): void {
  ctx.tools.register(defineTool({
    name: 'generate_ui',
    description: TOOL_DESCRIPTION,
    parameters: {
      request: { type: 'string', required: true, description: 'Natural-language description of the UI: information hierarchy, data relationships, and interactions. No colors or CSS.' },
      data: { type: 'json', description: 'A JSON object of the concrete values the UI should present.' },
      component_names: { type: 'array', items: { type: 'string' }, description: 'Optional exact component set to restrict the compiler to; the structural root is added automatically.' },
      edit_surface_id: { type: 'string', description: 'To edit an existing rendered surface, its id (the earlier call id). The current document is loaded and revised rather than rebuilt.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          surfaceId: { type: 'string', required: true },
          componentNames: { type: 'array', required: true, items: { type: 'string' } },
          warningCount: { type: 'integer', required: true },
          edited: { type: 'boolean', required: true },
          meta: { type: 'json', required: true },
        },
      },
      // The model sees a short receipt; the client renders the document.
      render: (_args, value) => {
        const names = value.componentNames.join(', ')
        const warned = value.warningCount > 0 ? ` (${value.warningCount} component(s) dropped)` : ''
        const verb = value.edited ? 'Updated' : 'Rendered'
        return [{
          type: 'text',
          text: `${verb} an interactive UI (surface ${value.surfaceId}) with ${value.componentNames.length} component type(s): ${names}${warned}. It is shown to the user inline — do not repeat it as text.`,
        }]
      },
      // The full document + facts ride in meta: durable, replayed, unbounded,
      // and never in the model-facing content that would spill.
      presentationMeta: (_args, value): JsonValue => value.meta,
    },
    isConcurrencySafe: () => false,
    async execute(args, exec: ToolExecution) {
      const request = args.request.trim()
      if (request.length === 0) throw new Error('generate_ui: request must not be empty')
      if (exec.agent === undefined) throw new Error('generate_ui: no calling agent')

      if (args.data !== undefined) {
        const bytes = Buffer.byteLength(JSON.stringify(args.data), 'utf8')
        if (bytes > config.maxDataBytes) {
          throw new Error(`generate_ui: data is ${bytes} bytes, over the ${config.maxDataBytes}-byte limit`)
        }
      }

      const editedSurfaceId = args.edit_surface_id?.trim()
      let currentDocument: string | undefined
      if (editedSurfaceId !== undefined && editedSurfaceId.length > 0) {
        currentDocument = documentForSurface(exec, editedSurfaceId)
        if (currentDocument === undefined) {
          throw new Error(`generate_ui: no surface "${editedSurfaceId}" was found in this session to edit`)
        }
      }

      const route = resolveRoute(exec.agent, config)
      const streamer = createDshStreamer(ctx, { route, sessionId: exec.agent.session.id, plugin: 'dsh-valuz-genui' })
      const componentNames = args.component_names?.filter((name) => name.length > 0)

      let result
      try {
        result = await generateUI({
          streamer,
          request,
          data: args.data,
          ...(componentNames !== undefined && componentNames.length > 0 ? { componentNames } : {}),
          ...(currentDocument !== undefined ? { currentDocument } : {}),
          maxOutputTokens: config.maxOutputTokens,
          maxContinuations: config.maxContinuations,
          maxAttempts: config.maxAttempts,
          ...(config.temperature === undefined ? {} : { temperature: config.temperature }),
          ...(exec.signal === undefined ? {} : { abortSignal: exec.signal }),
        })
      } catch (error: unknown) {
        if (error instanceof GenerateUIError) throw new Error(error.message)
        throw error
      }

      const surfaceId = String(exec.callId)
      const meta: GenuiSurfaceMeta = {
        kind: GENUI_META_KIND,
        surfaceId,
        document: result.document,
        request,
        componentNames: result.componentNames,
        warnings: result.warnings,
        attempts: result.attempts,
        continuations: result.continuations,
        route,
        usage: result.usage,
        ...(editedSurfaceId !== undefined && editedSurfaceId.length > 0 ? { editedSurfaceId } : {}),
      }
      return {
        surfaceId,
        componentNames: result.componentNames,
        warningCount: result.warnings.length,
        edited: currentDocument !== undefined,
        meta: meta as unknown as JsonValue,
      }
    },
    presentCall(args): GenericCallView {
      const editing = args.edit_surface_id !== undefined && args.edit_surface_id.length > 0
      return {
        card: 'generic',
        title: editing ? 'Updating interactive UI' : 'Generating interactive UI',
        kind: 'search',
        content: [{ type: 'text', text: args.request }],
      }
    },
    presentResult(_args, result: ToolResult): GenericResultView | undefined {
      // The real UI is the conversation node keyed on tool/result.meta; the
      // generic card is the fallback for a host without the client half.
      if (result.isError) return undefined
      return { card: 'generic', title: 'Interactive UI rendered' }
    },
  }))
}
