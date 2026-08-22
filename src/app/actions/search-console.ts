"use server";

import { redirect } from "next/navigation";

import { runSearchConsoleReport } from "@/lib/search-console/report";
import type { SearchConsoleReport } from "@/types/google-ads";

import type { ActionResult } from "./google-ads";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validateDateRange(start: string, end: string): string | null {
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end) || start > end) {
    return "Invalid date range: provide ISO dates (YYYY-MM-DD) with start ≤ end";
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function oauthErrorFromUnknown(err: unknown): { code?: string; description?: string } {
  const errorObj = asRecord(err);
  const response = asRecord(errorObj?.response);
  const data = asRecord(response?.data);
  const code = typeof data?.error === "string" ? data.error : undefined;
  const description = typeof data?.error_description === "string" ? data.error_description : undefined;
  return { code, description };
}

function isAuthError(err: unknown): boolean {
  const { code, description } = oauthErrorFromUnknown(err);
  const rawMessage = err instanceof Error ? err.message : "";
  return `${code ?? ""} ${description ?? ""} ${rawMessage}`.toLowerCase().includes("invalid_grant");
}

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

export interface SearchConsoleReportActionInput {
  start: string;
  end: string;
  siteUrl?: string | null;
  rowLimit?: number;
  forceRefresh?: boolean;
}

export async function getSearchConsoleReport(
  input: SearchConsoleReportActionInput,
): Promise<ActionResult<SearchConsoleReport>> {
  try {
    const rangeError = validateDateRange(input.start, input.end);
    if (rangeError) return { ok: false, error: rangeError };

    const data = await runSearchConsoleReport({
      dateRange: { start: input.start, end: input.end },
      siteUrl: input.siteUrl?.trim() ? input.siteUrl.trim() : null,
      rowLimit: input.rowLimit,
      forceRefresh: Boolean(input.forceRefresh),
    });
    return { ok: true, data };
  } catch (err) {
    if (isAuthError(err)) redirect("/api/search-console/oauth/authorize");
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}
