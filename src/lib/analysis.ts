import { analyzeDispute } from "./agent";
import { getCase, updateCase } from "./cases";
import { scriptedModel } from "./dev/scripted-model";
import { paypal } from "./paypal";
import type { CaseRecord, TraceStep } from "./types";

const running = new Set<string>();

export async function runAnalysis(caseId: string, onStep?: (s: TraceStep) => void): Promise<CaseRecord> {
  const c = getCase(caseId);
  if (!c) throw new Error(`Unknown case ${caseId}`);
  if (c.submitted) throw new Error("This dispute already has a response.");
  if (running.has(caseId)) throw new Error("Analysis is already running for this dispute.");
  running.add(caseId);
  try {
    const dispute = await paypal().getDispute(caseId);
    updateCase(caseId, { dispute, status: "ANALYZING", trace: [], recommendation: undefined, error: undefined });
    const trace: TraceStep[] = [];
    const scripted = process.env.REBUTTAL_SCRIPTED_MODEL === "1" && process.env.NODE_ENV !== "production";
    const { recommendation } = await analyzeDispute(dispute, {
      client: scripted ? (scriptedModel() as never) : undefined,
      onStep: (s) => {
        trace.push(s);
        updateCase(caseId, { trace: [...trace] });
        onStep?.(s);
      },
    });
    return updateCase(caseId, { status: "READY", recommendation, trace });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    updateCase(caseId, { status: "ERROR", error });
    throw e;
  } finally {
    running.delete(caseId);
  }
}
