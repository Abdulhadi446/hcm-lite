import { headers } from "next/headers";
import { requireRole } from "@/lib/guards";
import { apiErrorJson, fieldError } from "@/lib/services/http";
import { computeMetrics } from "@/lib/services/analytics";
import { isIsoDate, monthRange, todayIso } from "@/lib/dates";
import {
  AiError,
  aiModel,
  aiRateLimitFor,
  chatCompletion,
  hasAiKey,
  writeAiLog,
  type AiMessage,
} from "@/lib/ai/client";

/**
 * GET /api/ai/summary — 3–5 insight bullets for the current dashboard KPIs.
 *
 * KPIs are always recomputed server-side from `computeMetrics`; the query
 * string may only narrow the scope (dates + department), never supply numbers.
 * Any AI failure (no key, timeout, upstream error, unparseable answer) falls
 * back to a deterministic rules-based summary derived from the same metrics.
 */

const MIN_BULLETS = 3;
const MAX_BULLETS = 5;
const MAX_BULLET_CHARS = 200;

const SYSTEM_PROMPT = [
  "You write short executive HR dashboard summaries for HCM Lite.",
  `Today is ${todayIso()}.`,
  "You receive a JSON payload of KPIs that were computed server-side from live records.",
  "Write 3 to 5 insight bullets for an Admin or HR reader.",
  "Rules:",
  `- Each bullet is one plain-text sentence, at most ${MAX_BULLET_CHARS} characters.`,
  "- No markdown, no headings, no code fences, no leading dash or numbering.",
  "- Use ONLY numbers that appear in the payload. Never estimate, extrapolate or invent a figure.",
  "- Payroll is aggregate only: never mention an individual employee's salary, payslip or net pay.",
  "- Prefer decision-useful observations: attendance rate, absenteeism, late arrivals, leave, pending approvals, payroll cost.",
  'Return ONLY JSON in this exact shape: {"insights":["bullet","bullet","bullet"]}',
].join("\n");

// ------------------------------------------------------------------ types

/** Insight lists added to `MetricsResult` by the analytics lane (optional here). */
type MetricsInsights = {
  topLateComers?: Array<{
    name?: string | null;
    departmentName?: string | null;
    lateDays?: number | null;
  }>;
  leaveByType?: Array<{
    typeName?: string | null;
    approvedDays?: number | null;
    utilization?: number | null;
  }>;
  payrollByDepartment?: Array<{
    departmentName?: string | null;
    headcount?: number | null;
    payrollCost?: number | null;
  }>;
};

type Metrics = ReturnType<typeof computeMetrics>;

function insightsOf(metrics: Metrics): MetricsInsights {
  const value = (metrics as unknown as { insights?: MetricsInsights }).insights;
  return value && typeof value === "object" ? value : {};
}

// -------------------------------------------------------------- formatting

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function moneyText(value: number): string {
  return money.format(Number.isFinite(value) ? value : 0);
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

// -------------------------------------------------------------- AI parsing

/** Parse the first `{...}` block, tolerating code fences and prose around it. */
function parseJsonBlock(raw: string): unknown {
  const cleaned = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function cleanBullet(value: unknown): string {
  if (typeof value !== "string") return "";
  let text = value
    .replace(/\r?\n/g, " ")
    .replace(/^\s*(?:[-*•–—]+|\d{1,2}[.)])\s*/, "")
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > MAX_BULLET_CHARS) {
    text = `${text.slice(0, MAX_BULLET_CHARS - 1).trimEnd()}…`;
  }
  return text;
}

/**
 * Accept either `{"insights":[...]}` JSON or a plain bullet list. Returns
 * `null` when fewer than 3 usable bullets survive.
 */
function parseInsights(raw: string): string[] | null {
  const fromJson: unknown[] = [];
  const parsed = parseJsonBlock(raw);
  if (parsed && typeof parsed === "object") {
    const list = Array.isArray(parsed)
      ? parsed
      : (parsed as { insights?: unknown }).insights;
    if (Array.isArray(list)) fromJson.push(...list);
  }

  const candidates: string[] = [];
  if (fromJson.length >= MIN_BULLETS) {
    candidates.push(...fromJson.filter((item): item is string => typeof item === "string"));
  }

  if (candidates.length < MIN_BULLETS) {
    const lines = raw
      .replace(/```(?:json)?/gi, "")
      .replace(/```/g, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const marked = lines.filter((line) => /^(?:[-*•–—]+|\d{1,2}[.)])\s+/.test(line));
    const pool =
      marked.length >= MIN_BULLETS
        ? marked
        : lines.filter(
            (line) =>
              !/^[[{]/.test(line) &&
              !/^"?(insights|data|summary|here)\b/i.test(line) &&
              line.length >= 10
          );
    candidates.push(...pool);
  }

  const seen = new Set<string>();
  const bullets: string[] = [];
  for (const candidate of candidates) {
    const text = cleanBullet(candidate);
    if (text.length < 10) continue;
    if (/^[[{]/.test(text)) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    bullets.push(text);
    if (bullets.length >= MAX_BULLETS) break;
  }

  return bullets.length >= MIN_BULLETS ? bullets : null;
}

// ----------------------------------------------------------- deterministic

/**
 * Rules-based bullets, derived only from the computed metrics. Used when the
 * model is missing, times out or returns something unparseable.
 */
function fallbackInsights(metrics: Metrics): string[] {
  const { kpis, byDepartment, pending, scope } = metrics;
  const insight = insightsOf(metrics);
  const bullets: string[] = [];

  if (kpis.headcount === 0) {
    bullets.push(
      `No employees are in scope for ${scope.from} to ${scope.to}; KPIs stay empty until headcount or the range changes.`
    );
  } else {
    bullets.push(
      `${plural(kpis.headcount, "employee")} across ${plural(byDepartment.length, "department")}; attendance is ${kpis.attendanceRate}% over ${plural(kpis.workingDays, "working day")} (${scope.from} to ${scope.to}).`
    );
  }

  bullets.push(
    `Absenteeism is ${kpis.absenteeismRate}% with ${plural(kpis.absentDays, "absent day")} against ${plural(kpis.expectedDays, "expected day")}.`
  );

  if (kpis.lateDays === 0) {
    bullets.push("No late arrivals were recorded in this period.");
  } else {
    const top = (insight.topLateComers ?? [])[0];
    const topName = top?.name?.trim();
    const topLateDays = Number(top?.lateDays ?? 0);
    const topSuffix =
      topName && topLateDays > 0
        ? `; ${topName} is the most frequent late-comer with ${plural(topLateDays, "late day")}`
        : "";
    bullets.push(
      `${plural(kpis.lateDays, "late arrival")} recorded (${kpis.latePct}% of attended days)${topSuffix}.`
    );
  }

  if (pending.leaves === 0 && pending.corrections === 0) {
    bullets.push("No leave requests or attendance corrections are waiting for approval.");
  } else {
    bullets.push(
      `${plural(pending.leaves, "leave request")} and ${plural(pending.corrections, "attendance correction")} are pending approval.`
    );
  }

  if (kpis.payrollCost > 0) {
    const label = kpis.payrollLabel === "YTD" ? "year to date" : "for this period";
    bullets.push(
      `Payroll cost is ${moneyText(kpis.payrollCost)} ${label}${kpis.payrollHasDraft ? ", including a draft run" : ""}.`
    );
  } else {
    bullets.push("No payroll run covers this period yet, so payroll cost is not included.");
  }

  return bullets.slice(0, MAX_BULLETS);
}

// ------------------------------------------------------------------ route

export async function GET(request: Request) {
  await headers();
  try {
    const user = await requireRole("hr", "admin");

    const params = new URL(request.url).searchParams;
    const month = monthRange(todayIso().slice(0, 7));
    const fromRaw = params.get("from");
    const toRaw = params.get("to");

    if (fromRaw && !isIsoDate(fromRaw)) {
      throw fieldError("from", "Use a valid date (YYYY-MM-DD)");
    }
    if (toRaw && !isIsoDate(toRaw)) {
      throw fieldError("to", "Use a valid date (YYYY-MM-DD)");
    }

    const from = fromRaw ?? month.start;
    const to = toRaw ?? month.end;
    if (from > to) throw fieldError("from", "from must be on or before to");

    const departmentRaw = params.get("departmentId");
    if (departmentRaw !== null && departmentRaw !== "" && !/^\d+$/.test(departmentRaw)) {
      throw fieldError("departmentId", "departmentId must be a number");
    }
    const departmentId = departmentRaw ? Number(departmentRaw) : null;

    const limit = aiRateLimitFor(user.id);
    if (limit.limited) {
      return Response.json(
        { error: "rate_limited", retryAfterSeconds: limit.retryAfterSeconds },
        { status: 429 }
      );
    }

    const started = Date.now();
    const metrics = computeMetrics({ from, to, departmentId });
    const insight = insightsOf(metrics);

    // Compact payload: aggregates only, no per-employee compensation.
    const payload = {
      scope: { from, to, departmentId },
      kpis: {
        headcount: metrics.kpis.headcount,
        workingDays: metrics.kpis.workingDays,
        presentDays: metrics.kpis.presentDays,
        lateDays: metrics.kpis.lateDays,
        halfDays: metrics.kpis.halfDays,
        onLeaveDays: metrics.kpis.onLeaveDays,
        absentDays: metrics.kpis.absentDays,
        newHires: metrics.kpis.newHires,
        attendanceRate: metrics.kpis.attendanceRate,
        latePct: metrics.kpis.latePct,
        absenteeismRate: metrics.kpis.absenteeismRate,
        leaveUtilization: metrics.kpis.leaveUtilization,
        payrollCost: metrics.kpis.payrollCost,
        payrollLabel: metrics.kpis.payrollLabel,
        payrollHasDraft: metrics.kpis.payrollHasDraft,
        pendingLeaves: metrics.pending.leaves,
        openCorrections: metrics.pending.corrections,
      },
      today: metrics.today,
      byDepartment: metrics.byDepartment.map((row) => ({
        department: row.departmentName,
        headcount: row.headcount,
        attendanceRate: row.attendanceRate,
        latePct: row.latePct,
      })),
      insights: {
        topLateComers: (insight.topLateComers ?? []).slice(0, 5).map((row) => ({
          name: row.name ?? "",
          department: row.departmentName ?? null,
          lateDays: Number(row.lateDays ?? 0),
        })),
        leaveByType: (insight.leaveByType ?? []).slice(0, 8).map((row) => ({
          type: row.typeName ?? "",
          approvedDays: Number(row.approvedDays ?? 0),
          utilization: Number(row.utilization ?? 0),
        })),
        payrollByDepartment: (insight.payrollByDepartment ?? []).map((row) => ({
          department: row.departmentName ?? "Unassigned",
          headcount: Number(row.headcount ?? 0),
          payrollCost: Number(row.payrollCost ?? 0),
        })),
      },
    };

    const messages: AiMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `DATA:\n${JSON.stringify(payload)}` },
    ];

    let insights: string[] | null = null;
    let aiGenerated = false;
    let model = aiModel();
    let detail: string | null = null;

    if (!hasAiKey()) {
      detail = "no_key: OPENAI_API_KEY is not set";
    } else {
      try {
        const completion = await chatCompletion({ messages });
        model = completion.model;
        insights = completion.content ? parseInsights(completion.content) : null;
        if (!insights) detail = "unparseable: model answer had fewer than 3 usable bullets";
        else aiGenerated = true;
      } catch (err) {
        const aiError =
          err instanceof AiError
            ? err
            : new AiError("upstream", err instanceof Error ? err.message : "unknown");
        detail = `${aiError.kind}: ${aiError.detail}`;
        if (aiError.kind !== "no_key") {
          console.error("[ai/summary] model call failed:", aiError.kind, aiError.detail);
        }
      }
    }

    if (!aiGenerated || !insights) {
      insights = fallbackInsights(metrics);
    }

    const latencyMs = Date.now() - started;
    writeAiLog({
      userId: user.id,
      role: user.role,
      prompt: `[dashboard_summary] from=${from} to=${to} departmentId=${departmentId ?? "all"}`,
      toolCalls: [{ name: "dashboard_summary", ms: latencyMs }],
      answer: insights.join("\n"),
      model,
      latencyMs,
      ok: aiGenerated,
      detail,
    });

    return Response.json({
      ok: true,
      insights,
      aiGenerated,
      fallback: !aiGenerated,
      ...(aiGenerated ? { model } : {}),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return apiErrorJson(err);
  }
}
