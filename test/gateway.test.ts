import assert from "node:assert/strict";
import { test } from "node:test";
import type { DenyReason } from "../src/contracts.ts";
import { demoStore, documents, grantFor, privateRecordId } from "../src/fixtures.ts";
import { Gateway } from "../src/gateway.ts";

const publicRead = { tool: "documents.read", args: { documentId: documents.benign.id } };
const privateRead = { tool: "records.read", args: { recordId: privateRecordId } };
const canary = "SYNTHETIC_CANARY_AF_V01";

const deniedCalls: [DenyReason, unknown][] = [
  ["INVALID_ARGUMENTS", { tool: "records.read", args: { recordId: 42 } }],
  ["INVALID_ARGUMENTS", { ...privateRead, grant: [privateRecordId] }],
  ["UNKNOWN_TOOL", { tool: "unregistered", args: {} }],
  ["RESOURCE_NOT_FOUND", { tool: "records.read", args: { recordId: "unknown" } }],
  ["RESOURCE_NOT_GRANTED", privateRead],
];

for (const [reasonCode, call] of deniedCalls) {
  test(`rejects ${reasonCode} before adapter entry`, async () => {
    const gateway = new Gateway();
    const runId = gateway.createRun(grantFor("benign"));
    assert.deepEqual(await gateway.invoke(runId, call), {
      decision: { type: "deny", reasonCode }, execution: "not_dispatched", decisionSequence: 1,
    });
    const evidence = gateway.evidence(runId);
    assert.deepEqual(evidence.adapterEffects, { invocations: [], writes: [] });
    assert.deepEqual(evidence.events[1], {
      sequence: 2, kind: "execution", decisionSequence: 1, outcome: "not_dispatched",
    });
  });
}

test("missing and released runs confer zero permissions and do not create state", async () => {
  const gateway = new Gateway();
  const runId = gateway.createRun(undefined);
  const noGrant = await gateway.invoke(runId, publicRead);
  assert.deepEqual(noGrant.decision, { type: "deny", reasonCode: "MISSING_GRANT" });
  assert.equal(noGrant.execution, "not_dispatched");
  assert.deepEqual(gateway.evidence(runId).adapterEffects, { invocations: [], writes: [] });
  gateway.release(runId);
  const noRun = await gateway.invoke(runId, publicRead);
  assert.deepEqual(noRun, { ...noGrant, decisionSequence: null });
  assert.throws(() => gateway.evidence(runId), /missing/);
});

test("policy errors deny dispatch and omit the resolver exception", async () => {
  const gateway = new Gateway({
    ...demoStore,
    resolve() { throw new Error(canary); },
  });
  const runId = gateway.createRun(grantFor("benign"));
  assert.deepEqual(await gateway.invoke(runId, publicRead), {
    decision: { type: "deny", reasonCode: "POLICY_ERROR" },
    decisionSequence: 1,
    execution: "not_dispatched",
  });
  const evidence = gateway.evidence(runId);
  assert.deepEqual(evidence.adapterEffects, { invocations: [], writes: [] });
  assert.ok(!JSON.stringify(evidence).includes(canary));
});

test("captures an immutable grant by operation and returns the canary only on an authorized read", async () => {
  const gateway = new Gateway();
  const records: string[] = [];
  const denied = gateway.createRun({ documents: [privateRecordId], records, destinations: [] });
  records.push(privateRecordId);
  const allowed = gateway.createRun({ documents: [], records, destinations: [] });
  records.length = 0;

  assert.deepEqual((await gateway.invoke(denied, privateRead)).decision, {
    type: "deny", reasonCode: "RESOURCE_NOT_GRANTED",
  });
  const result = await gateway.invoke(allowed, privateRead);
  assert.equal(result.execution, "succeeded");
  assert.equal(result.value, canary);
  const evidence = gateway.evidence(allowed);
  assert.deepEqual(evidence.adapterEffects.invocations, [
    { tool: "records.read", resourceId: privateRecordId, count: 1 },
  ]);
  assert.ok(!JSON.stringify(evidence).includes(canary));
});

test("records the allow before adapter entry and records adapter exceptions as execution failures", async () => {
  let atEntry;
  const gateway = new Gateway({
    ...demoStore,
    async readDocument() {
      atEntry = gateway.evidence(runId);
      throw new Error(canary);
    },
  });
  const runId = gateway.createRun(grantFor("benign"));
  const result = await gateway.invoke(runId, publicRead);
  assert.deepEqual(result, {
    decision: { type: "allow", reasonCode: "GRANT_MATCH" },
    execution: "failed",
    decisionSequence: 1,
  });
  assert.deepEqual(atEntry, {
    events: [{
      sequence: 1, kind: "decision", tool: "documents.read", resourceId: documents.benign.id,
      decision: result.decision,
    }],
    adapterEffects: {
      invocations: [{ tool: "documents.read", resourceId: documents.benign.id, count: 1 }],
      writes: [],
    },
  });
  const evidence = gateway.evidence(runId);
  assert.deepEqual(evidence.events[1], {
    sequence: 2, kind: "execution", decisionSequence: 1, outcome: "failed",
  });
  assert.ok(!JSON.stringify(evidence).includes(canary));
});

test("interleaved calls cannot borrow another run's document permission", async () => {
  const gateway = new Gateway();
  const first = gateway.createRun(grantFor("benign"));
  const second = gateway.createRun(grantFor("suspicious"));
  const flaggedRead = { tool: "documents.read", args: { documentId: documents.suspicious.id } };
  const outcomes = await Promise.all([
    gateway.invoke(first, publicRead),
    gateway.invoke(second, publicRead),
    gateway.invoke(first, flaggedRead),
    gateway.invoke(second, flaggedRead),
  ]);
  assert.deepEqual(outcomes.map(({ execution }) => execution), [
    "succeeded", "not_dispatched", "not_dispatched", "succeeded",
  ]);
  assert.deepEqual(gateway.evidence(first).adapterEffects.invocations, [
    { tool: "documents.read", resourceId: documents.benign.id, count: 1 },
  ]);
  assert.deepEqual(gateway.evidence(second).adapterEffects.invocations, [
    { tool: "documents.read", resourceId: documents.suspicious.id, count: 1 },
  ]);
});
