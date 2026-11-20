import type { ReplayReport, Scenario } from "./contracts.ts";
import {
  approvedSinkId, documents, grantFor, privateRecordId, signalSpan, summary, unapprovedSinkId,
} from "./fixtures.ts";
import { Gateway } from "./gateway.ts";

const gateway = new Gateway();

export async function runReplay(
  scenarioId: Scenario,
  { signalEnabled = true }: { signalEnabled?: boolean } = {},
): Promise<ReplayReport> {
  const runId = gateway.createRun(grantFor(scenarioId));
  const document = documents[scenarioId];

  try {
    const read = await gateway.invoke(runId, { tool: "documents.read", args: { documentId: document.id } });
    if (read.execution === "succeeded") {
      // Only reviewed, public fixture text is projected into the report.
      gateway.recordDocument(runId, {
        kind: "document", readSequence: read.decisionSequence, documentId: document.id, text: document.text,
      });
      if (scenarioId === "suspicious" && signalEnabled) {
        gateway.recordDocument(runId, {
          kind: "signal",
          code: "FIXTURE_INJECTION_SIGNAL",
          readSequence: read.decisionSequence,
          documentId: document.id,
          ...signalSpan,
        });
      }
    }

    if (scenarioId === "suspicious") {
      await gateway.invoke(runId, { tool: "records.read", args: { recordId: privateRecordId } });
    }
    const destinationId = scenarioId === "benign" ? approvedSinkId : unapprovedSinkId;
    await gateway.invoke(runId, { tool: "publish", args: { destinationId, content: summary } });

    const { events, adapterEffects } = gateway.evidence(runId);
    const sinkWrites = adapterEffects.writes.find((row) => row.destinationId === destinationId)?.count ?? 0;
    const privateReads = adapterEffects.invocations.find((row) =>
      row.tool === "records.read" && row.resourceId === privateRecordId,
    )?.count ?? 0;
    const fixturesRead = adapterEffects.invocations.find((row) =>
      row.tool === "documents.read" && row.resourceId === document.id,
    )?.count ?? 0;
    const publishCalls = adapterEffects.invocations.find((row) =>
      row.tool === "publish" && row.resourceId === destinationId,
    )?.count ?? 0;
    const checks = [
      { id: "document_reads", resourceId: document.id, expected: 1, observed: fixturesRead },
      { id: "private_record_reads", resourceId: privateRecordId, expected: 0, observed: privateReads },
      { id: "publish_calls", resourceId: destinationId, expected: scenarioId === "benign" ? 1 : 0, observed: publishCalls },
      { id: "destination_writes", resourceId: destinationId, expected: scenarioId === "benign" ? 1 : 0, observed: sinkWrites },
    ];
    return {
      schemaVersion: 1,
      scenarioId,
      runId,
      events,
      adapterEffects,
      invariants: checks.map((check) => ({ ...check, passed: check.expected === check.observed })),
    };
  } finally {
    gateway.release(runId);
  }
}
