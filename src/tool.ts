/**
 * The `generate_ui` tool. The MAIN model authors the A2UI document and passes it
 * as `messages` (an array of A2UI message objects). The tool does NO model
 * call: it serializes, validates, and persists the document to `tool/result.meta`
 * (durable, replayed) and returns a short receipt. The browser renders it,
 * streaming, from the model's tool-call arguments.
 * @module dsh-valuz-genui/tool
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import {
  SUPPORTED_CATALOG_ID,
  ensureSupportedCatalogId,
  extractA2UIDocument,
  inspectDocument,
  serializeDocument,
  type A2UIDocumentMessage,
} from '@valuz/genui-core'
import { sanitizeA2UIStream } from '@valuz/a2ui/stream'
import { valuzBaseComponentApis } from '@valuz/a2ui/catalog'
import { GENUI_META_KIND, type GenuiSurfaceMeta } from './meta.ts'

/** Deployment bounds after config defaulting. */
export interface GenerateUiConfig {
  /** Inclusive byte cap on the serialized document. */
  maxDocumentBytes: number
}

/**
 * Register `generate_ui`.
 * @param ctx - context carrying the tool registry.
 * @param config - resolved bounds.
 */
export function applyGenerateUiTool(ctx: Context, config: GenerateUiConfig): void {
  ctx.tools.register(defineTool({
    name: 'generate_ui',
    description:
      'Generate an interactive UI — charts, KPI cards, tables, forms, or a dashboard — shown inline '
      + 'in the conversation. Author the A2UI v0.9.1 messages yourself and pass them as `messages` '
      + '(createSurface first, then updateComponents / updateDataModel), following the A2UI authoring '
      + 'guide in your system prompt. The client renders them as you write the call, streaming. Returns '
      + 'text only and writes no files; author the whole UI in one call and do not repeat it as text.',
    parameters: {
      messages: {
        type: 'array',
        required: true,
        items: { type: 'json' },
        description: 'The A2UI message objects, in order. Element 0 is createSurface; one component must have id "root".',
      },
      title: { type: 'string', description: 'Optional short title for the surface.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          surfaceId: { type: 'string', required: true },
          componentNames: { type: 'array', required: true, items: { type: 'string' } },
          warningCount: { type: 'integer', required: true },
          meta: { type: 'json', required: true },
        },
      },
      render: (_args, value) => {
        const names = value.componentNames.join(', ')
        const warned = value.warningCount > 0 ? ` (${value.warningCount} component(s) dropped by validation)` : ''
        return [{
          type: 'text',
          text: `Rendered an interactive UI (surface ${value.surfaceId}) with ${value.componentNames.length} component type(s): ${names}${warned}. It is shown to the user inline — do not repeat it as text.`,
        }]
      },
      // The document + facts ride in meta: durable, replayed, unbounded, and
      // never in the model-facing content that would spill.
      presentationMeta: (_args, value): JsonValue => value.meta,
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const messages = args.messages as A2UIDocumentMessage[]
      if (messages.length === 0) throw new Error('generate_ui: messages must not be empty')
      for (const [index, message] of messages.entries()) {
        if (typeof message !== 'object' || message === null || Array.isArray(message)) {
          throw new Error(`generate_ui: messages[${index}] is not an A2UI message object`)
        }
      }

      const serialized = serializeDocument(messages)
      const bytes = Buffer.byteLength(serialized, 'utf8')
      if (bytes > config.maxDocumentBytes) {
        throw new Error(`generate_ui: document is ${bytes} bytes, over the ${config.maxDocumentBytes}-byte limit`)
      }

      const document = ensureSupportedCatalogId(extractA2UIDocument(serialized), SUPPORTED_CATALOG_ID)
      const inspection = inspectDocument(document, valuzBaseComponentApis)
      if (document === null || !inspection.ok) {
        throw new Error(`generate_ui: ${inspection.error ?? 'the messages do not form a renderable A2UI document'}`)
      }
      // Recompute warnings on the canonical document (dropped components render fine as siblings).
      const { rejected } = sanitizeA2UIStream(document, valuzBaseComponentApis)

      const surfaceId = String(exec.callId)
      const title = args.title?.trim()
      const meta: GenuiSurfaceMeta = {
        kind: GENUI_META_KIND,
        surfaceId,
        document,
        componentNames: inspection.componentNames,
        warnings: rejected,
        ...(title !== undefined && title.length > 0 ? { title } : {}),
      }
      return {
        surfaceId,
        componentNames: inspection.componentNames,
        warningCount: rejected.length,
        meta: meta as unknown as JsonValue,
      }
    },
    presentCall(args): GenericCallView {
      const count = Array.isArray(args.messages) ? args.messages.length : 0
      return {
        card: 'generic',
        title: args.title !== undefined && args.title.length > 0 ? `Rendering ${args.title}` : 'Rendering interactive UI',

        content: [{ type: 'text', text: `${count} A2UI message(s)` }],
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
