import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { apiError } from "@/lib/guards";

export async function POST() {
  try {
    const res = NextResponse.json({ ok: true });
    clearSessionCookie(res);
    return res;
  } catch (err) {
    return apiError(err);
  }
}
