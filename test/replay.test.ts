import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import type { Scenario } from "../src/contracts.ts";
import { approvedSinkId, documents, privateRecordId, summary, unapprovedSinkId } from "../src/fixtures.ts";
import { runReplay } from "../src/replay.ts";
import { createLocalServer } from "../src/server.ts";

test("benign replay writes one fixture summary to the approved sink", async () => {
  const report = await runReplay("benign");
  assert.deepEqual(report.adapterEffects.writes, [{ destinationId: approvedSinkId, count: 1 }]);
  assert.deepEqual(report.adapterEffects.invocations, [
    { tool: "documents.read", resourceId: documents.benign.id, count: 1 },
    { tool: "publish", resourceId: approvedSinkId, count: 1 },
  ]);
  assert.ok(report.events.every((event) => event.kind !== "signal"));
  assert.equal(report.events.filter((event) => event.kind === "execution" && event.outcome === "succeeded").length, 2);
  assert.ok(report.invariants.every((invariant) => invariant.passed));
});

test("suspicious replay links the fixture warning to the read and independently blocks both requests", async () => {
  const report = await runReplay("suspicious");
  const { events, adapterEffects } = report;
  const denies = events.filter((event) => event.kind === "decision")
    .filter((event) => event.decision.type === "deny");
  assert.deepEqual(denies.map((event) => event.resourceId), [privateRecordId, unapprovedSinkId]);
  for (const denial of denies) {
    assert.equal(denial.decision.reasonCode, "RESOURCE_NOT_GRANTED");
    assert.ok(events.some((event) =>
      event.kind === "execution" && event.decisionSequence === denial.sequence && event.outcome === "not_dispatched",
    ));
  }
  const signal = events.find((event) => event.kind === "signal");
  const document = events.find((event) => event.kind === "document");
  assert.ok(signal && document);
  assert.equal(signal.code, "FIXTURE_INJECTION_SIGNAL");
  assert.equal(signal.documentId, document.documentId);
  assert.equal(signal.readSequence, document.readSequence);
  assert.equal(document.text.slice(signal.start, signal.end), "[Fixture marker: suspected instruction injection]");
  assert.ok(events.some((event) =>
    event.kind === "decision" && event.sequence === document.readSequence && event.tool === "documents.read",
  ));
  assert.deepEqual(adapterEffects, {
    invocations: [{ tool: "documents.read", resourceId: documents.suspicious.id, count: 1 }],
    writes: [],
  });
  assert.ok(report.invariants.every((invariant) => invariant.passed));
});

test("authorization decisions and adapter effects are independent of the fixture warning", async () => {
  const [marked, silent] = await Promise.all([
    runReplay("suspicious"), runReplay("suspicious", { signalEnabled: false }),
  ]);
  assert.ok(!silent.events.some((event) => event.kind === "signal"));
  const decisions = (report: typeof marked) => report.events
    .filter((event) => event.kind === "decision")
    .map(({ decision, tool, resourceId }) => ({ decision, tool, resourceId }));
  assert.deepEqual(decisions(marked), decisions(silent));
  assert.deepEqual(marked.adapterEffects, silent.adapterEffects);
});

test("concurrent replays have separate IDs, event sequences, grants, and sink writes", async () => {
  const scenarios: Scenario[] = ["benign", "suspicious", "benign", "suspicious"];
  const reports = await Promise.all(scenarios.map((scenario) => runReplay(scenario)));
  assert.equal(new Set(reports.map((report) => report.runId)).size, scenarios.length);
  reports.forEach(({ scenarioId, events, adapterEffects }) => {
    assert.deepEqual(events.map((event) => event.sequence), events.map((_, index) => index + 1));
    assert.deepEqual(events.filter((event) => event.kind === "document").map((event) => event.documentId), [
      documents[scenarioId].id,
    ]);
    assert.deepEqual(adapterEffects.writes, scenarioId === "benign" ? [
      { destinationId: approvedSinkId, count: 1 },
    ] : []);
  });
});

test("local API exposes the versioned public report and accepts only scripted scenario requests", async (t) => {
  const server = createLocalServer().listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const post = (body: string) => fetch(`${base}/api/replays`, {
    method: "POST", body, headers: { "Content-Type": "application/json" },
  });

  const response = await post('{"scenarioId":"suspicious"}');
  assert.equal(response.status, 200);
  const raw = await response.text();
  assert.ok(!raw.includes("SYNTHETIC_CANARY_AF_V01"));
  const report = JSON.parse(raw);
  assert.deepEqual(Object.keys(report).sort(), [
    "adapterEffects", "events", "invariants", "runId", "scenarioId", "schemaVersion",
  ]);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.scenarioId, "suspicious");
  const benign = await post('{"scenarioId":"benign"}');
  const benignText = await benign.text();
  assert.ok(!benignText.includes(JSON.stringify(summary)));
  assert.equal((await post('{"scenarioId":"unknown"}')).status, 400);
  assert.equal((await post('{"scenarioId":"benign","tool":"records.read"}')).status, 400);
  assert.equal((await post("invalid")).status, 400);
  assert.equal((await post("x".repeat(1025))).status, 413);
  assert.equal((await fetch(`${base}/api/replays`)).status, 405);
  assert.equal((await fetch(`${base}/api/tools`)).status, 404);
  assert.equal((await fetch(base)).status, 200);
});
