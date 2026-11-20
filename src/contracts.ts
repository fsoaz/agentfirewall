export type ToolCall =
  | { tool: "documents.read"; args: { documentId: string } }
  | { tool: "records.read"; args: { recordId: string } }
  | { tool: "publish"; args: { destinationId: string; content: string } };

export type Tool = ToolCall["tool"];
export type Scenario = "benign" | "suspicious";

export interface GrantDefinition {
  readonly documents: readonly string[];
  readonly records: readonly string[];
  readonly destinations: readonly string[];
}

export type DenyReason =
  | "INVALID_ARGUMENTS"
  | "UNKNOWN_TOOL"
  | "MISSING_GRANT"
  | "RESOURCE_NOT_FOUND"
  | "RESOURCE_NOT_GRANTED"
  | "POLICY_ERROR";

export type Decision =
  | { type: "allow"; reasonCode: "GRANT_MATCH" }
  | { type: "deny"; reasonCode: DenyReason };

export type Execution = "not_dispatched" | "succeeded" | "failed";

export type InvocationResult =
  | { decision: Extract<Decision, { type: "deny" }>; execution: "not_dispatched"; decisionSequence: number | null }
  | { decision: Extract<Decision, { type: "allow" }>; execution: "failed"; decisionSequence: number }
  | { decision: Extract<Decision, { type: "allow" }>; execution: "succeeded"; decisionSequence: number; value: string | null };

export type ReportEvent = { sequence: number } & (
  | { kind: "decision"; tool: Tool | null; resourceId: string | null; decision: Decision }
  | { kind: "execution"; decisionSequence: number; outcome: Execution }
  | { kind: "document"; readSequence: number; documentId: string; text: string }
  | { kind: "signal"; code: "FIXTURE_INJECTION_SIGNAL"; readSequence: number; documentId: string; start: number; end: number }
);

export interface AdapterEffects {
  invocations: { tool: Tool; resourceId: string; count: number }[];
  writes: { destinationId: string; count: number }[];
}

export interface ReplayReport {
  schemaVersion: 1;
  scenarioId: Scenario;
  runId: string;
  events: ReportEvent[];
  adapterEffects: AdapterEffects;
  invariants: { id: string; resourceId: string; expected: number; observed: number; passed: boolean }[];
}

export function hasExactKeys<T extends string>(
  value: unknown,
  ...keys: T[]
): value is Record<T, unknown> {
  return value !== null
    && typeof value === "object"
    && Reflect.ownKeys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
