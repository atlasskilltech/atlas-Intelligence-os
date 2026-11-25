import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { tick } from "@/lib/scheduler/scheduler";

export const maxDuration = 300;

/**
 * GET /api/scheduler/tick — for hosts without an always-on process (Vercel Cron
 * or any external cron). Requires `Authorization: Bearer <CRON_SECRET>`.
 * Started runs continue in the background of this request.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) {
    return Response.json({ error: { message: "CRON_SECRET (16+ characters) is not set on the server." } }, { status: 503 });
  }
  const given = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: { message: "Unauthorized." } }, { status: 401 });
  }
  const pending = [];
  const result = await tick({ execute: (id) => pending.push(id) });
  if (pending.length) {
    const { executeRun } = await import("@/lib/engine/runner");
    after(() => Promise.all(pending.map((id) => executeRun(id))));
  }
  return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
}
