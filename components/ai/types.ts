export type AiRole = "admin" | "hr" | "employee";

export type ToolCall = {
  name: string;
  ms?: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  fallback?: boolean;
  error?: boolean;
};

/** How many turns we keep in the browser session (and send back as context). */
export const MAX_MESSAGES = 12;

const COMPANY_PROMPTS = [
  "Who was late today?",
  "Headcount by department",
  "Attendance rate this month",
  "How many leave requests are pending?",
];

const EMPLOYEE_PROMPTS = [
  "How many leave days do I have left?",
  "When did I check in today?",
  "What's my attendance this month?",
  "When is the next public holiday?",
];

export function promptsFor(role: AiRole): string[] {
  return role === "employee" ? EMPLOYEE_PROMPTS : COMPANY_PROMPTS;
}

export function scopeLabel(role: AiRole): string {
  return role === "employee" ? "Your records" : "Company-wide";
}

export const DISCLAIMER =
  "Answers are generated from live company data and may be incomplete.";
