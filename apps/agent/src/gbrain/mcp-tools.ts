import { z } from "zod";
import type { GBrainClient, KnowledgeChunk } from "./types.js";

export const SearchKnowledgeInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe("自然语言查询，例如「Prometheus 指标模型是什么」"),
  sourceId: z
    .string()
    .optional()
    .describe("可选，仅检索该数据源（例如 opsagent-architecture）"),
  topK: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe("返回条数，默认 5"),
});

export type SearchKnowledgeInput = z.infer<typeof SearchKnowledgeInputSchema>;

export const SEARCH_KNOWLEDGE_TOOL = {
  name: "search_knowledge",
  description:
    "Search the OpsAgent knowledge base (architecture, decisions, workflows, knowledge, devlog) via GBrain. Returns ranked snippets with sourceId for citation.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "自然语言查询，例如「Prometheus 指标模型是什么」",
      },
      sourceId: {
        type: "string",
        description:
          "可选，仅检索该数据源（例如 opsagent-architecture）",
      },
      topK: {
        type: "number",
        description: "返回条数，默认 5，最大 20",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
} as const;

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCallResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export function listTools(): ToolDefinition[] {
  return [
    {
      name: SEARCH_KNOWLEDGE_TOOL.name,
      description: SEARCH_KNOWLEDGE_TOOL.description,
      inputSchema: SEARCH_KNOWLEDGE_TOOL.inputSchema,
    },
  ];
}

export async function callTool(
  client: GBrainClient,
  name: string,
  args: unknown,
): Promise<ToolCallResult> {
  if (name !== SEARCH_KNOWLEDGE_TOOL.name) {
    return {
      isError: true,
      content: [{ type: "text", text: `unknown tool: ${name}` }],
    };
  }
  const parsed = SearchKnowledgeInputSchema.safeParse(args);
  if (!parsed.success) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `invalid arguments: ${parsed.error.message}`,
        },
      ],
    };
  }
  try {
    const chunks: KnowledgeChunk[] = await client.search(parsed.data);
    const text =
      chunks.length === 0
        ? "no results"
        : chunks
            .map(
              (c, i) =>
                `## [${i + 1}] ${c.title}\n- sourceId: ${c.sourceId}\n- path: ${c.path}\n- score: ${c.score.toFixed(3)}\n\n${c.content}\n`,
            )
            .join("\n---\n\n");
    return { content: [{ type: "text", text }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [{ type: "text", text: `search failed: ${message}` }],
    };
  }
}
