import { OPS_HTTP_METHOD } from "@opsagent/shared";

import { OpsApiError } from "./opsApi";

type Fetcher = typeof fetch;

export interface AnalysisResponseDto {
  incidentId: string;
  markdown: string;
  generatedAt: string;
  provider: string;
}

export const ANALYSIS_ERROR_CODE = {
  ANALYSIS_UNAVAILABLE: "ANALYSIS_UNAVAILABLE",
  ANALYSIS_TIMEOUT: "ANALYSIS_TIMEOUT",
} as const;

export const ANALYSIS_ROUTE = {
  ANALYZE: "/api/analysis",
} as const;

export async function requestAnalysis(
  serverUrl: string,
  fetcher: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<AnalysisResponseDto> {
  const response = await fetcher(`${serverUrl}${ANALYSIS_ROUTE.ANALYZE}`, {
    method: OPS_HTTP_METHOD.POST,
    signal,
  });

  const body = (await response.json().catch(() => ({}))) as
    | AnalysisResponseDto
    | { error?: { code?: string; message?: string } };

  if (!response.ok) {
    const error = body as { error?: { code?: string; message?: string } };
    throw new OpsApiError(
      response.status,
      error?.error?.code ?? ANALYSIS_ERROR_CODE.ANALYSIS_UNAVAILABLE,
      error?.error?.message ?? `analysis request failed (HTTP ${response.status})`,
    );
  }

  const data = body as AnalysisResponseDto;
  if (!data.incidentId || !data.markdown) {
    throw new OpsApiError(
      response.status,
      ANALYSIS_ERROR_CODE.ANALYSIS_UNAVAILABLE,
      "analysis response is missing required fields",
    );
  }

  return data;
}
