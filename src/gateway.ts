import { randomUUID } from "node:crypto";
import { hasExactKeys } from "./contracts.ts";
import type {
  AdapterEffects, Decision, DenyReason, GrantDefinition, InvocationResult, ReportEvent, Tool, ToolCall,
} from "./contracts.ts";
import { demoStore } from "./fixtures.ts";
import type { FixtureStore } from "./fixtures.ts";

type Grant = Readonly<Record<Tool, ReadonlySet<string>>>;
type Event<T = ReportEvent> = T extends ReportEvent ? Omit<T, "sequence"> : never;
const tools = ["documents.read", "records.read", "publish"] as const;

interface Run {
  readonly grant: Grant | undefined;
  readonly events: ReportEvent[];
  readonly calls: Record<Tool, Map<string, number>>;
  readonly sinks: Map<string, string[]>;
}

type Validation = { call: ToolCall; requestedId: string } | {
  reason: "INVALID_ARGUMENTS" | "UNKNOWN_TOOL";
  tool: Tool | null;
};

function validate(input: unknown): Validation {
  if (!hasExactKeys(input, "tool", "args")) return { reason: "INVALID_ARGUMENTS", tool: null };
  const { tool, args } = input;
  switch (tool) {
    case "documents.read":
      if (hasExactKeys(args, "documentId")) {
        const { documentId } = args;
        if (typeof documentId === "string") {
          return { call: { tool, args: { documentId } }, requestedId: documentId };
        }
      }
      break;
    case "records.read":
      if (hasExactKeys(args, "recordId")) {
        const { recordId } = args;
        if (typeof recordId === "string") {
          return { call: { tool, args: { recordId } }, requestedId: recordId };
        }
      }
      break;
    case "publish":
      if (hasExactKeys(args, "destinationId", "content")) {
        const { destinationId, content } = args;
        if (typeof destinationId === "string" && typeof content === "string") {
          return { call: { tool, args: { destinationId, content } }, requestedId: destinationId };
        }
      }
      break;
    default:
      return { reason: typeof tool === "string" ? "UNKNOWN_TOOL" : "INVALID_ARGUMENTS", tool: null };
  }
  return { reason: "INVALID_ARGUMENTS", tool };
}

function append(run: Run, event: Event): number {
  const sequence = run.events.length + 1;
  run.events.push({ ...event, sequence });
  return sequence;
}

function deny(
  run: Run | undefined,
  reasonCode: DenyReason,
  tool: Tool | null = null,
  resourceId: string | null = null,
): InvocationResult {
  const decision = Object.freeze({ type: "deny", reasonCode });
  const execution = "not_dispatched";
  if (!run) return { decision, execution, decisionSequence: null };

  const decisionSequence = append(run, { kind: "decision", tool, resourceId, decision });
  append(run, { kind: "execution", decisionSequence, outcome: execution });
  return { decision, execution, decisionSequence };
}

function recordCall(run: Run, tool: Tool, resourceId: string): void {
  const counts = run.calls[tool];
  counts.set(resourceId, (counts.get(resourceId) ?? 0) + 1);
}

export class Gateway {
  readonly #runs = new Map<string, Run>();
  readonly #adapters: {
    [T in Tool]: (run: Run, id: string, call: Extract<ToolCall, { tool: T }>) => string | null | Promise<string>;
  };

  readonly #store: FixtureStore;

  constructor(store: FixtureStore = demoStore) {
    this.#store = store;
    this.#adapters = {
      "documents.read": (run, id) => {
        recordCall(run, "documents.read", id);
        return store.readDocument(id);
      },
      "records.read": (run, id) => {
        recordCall(run, "records.read", id);
        return store.readRecord(id);
      },
      publish: (run, id, call) => {
        recordCall(run, "publish", id);
        const messages = run.sinks.get(id) ?? [];
        messages.push(call.args.content);
        run.sinks.set(id, messages);
        return null;
      },
    };
  }

  createRun(definition: GrantDefinition | undefined): string {
    const id = randomUUID();
    const grant = definition && Object.freeze({
      "documents.read": new Set(definition.documents),
      "records.read": new Set(definition.records),
      publish: new Set(definition.destinations),
    });
    this.#runs.set(id, {
      grant,
      events: [],
      calls: { "documents.read": new Map(), "records.read": new Map(), publish: new Map() },
      sinks: new Map(),
    });
    return id;
  }

  async invoke(runId: string, input: unknown): Promise<InvocationResult> {
    let validation: Validation;
    try {
      validation = validate(input);
    } catch {
      validation = { reason: "INVALID_ARGUMENTS", tool: null };
    }
    const run = this.#runs.get(runId);
    if ("reason" in validation) return deny(run, validation.reason, validation.tool);

    const { call, requestedId } = validation;
    if (!run?.grant) return deny(run, "MISSING_GRANT", call.tool);

    let resourceId: string;
    try {
      const resolved = this.#store.resolve(call.tool, requestedId);
      if (resolved === undefined) return deny(run, "RESOURCE_NOT_FOUND", call.tool);
      resourceId = resolved;
      if (!run.grant[call.tool].has(resourceId)) {
        return deny(run, "RESOURCE_NOT_GRANTED", call.tool, resourceId);
      }
    } catch {
      return deny(run, "POLICY_ERROR", call.tool);
    }

    const decision = Object.freeze({ type: "allow", reasonCode: "GRANT_MATCH" } satisfies Decision);
    const decisionSequence = append(run, { kind: "decision", tool: call.tool, resourceId, decision });
    let value: string | null;
    try {
      switch (call.tool) {
        case "documents.read":
          value = await this.#adapters["documents.read"](run, resourceId, call);
          break;
        case "records.read":
          value = await this.#adapters["records.read"](run, resourceId, call);
          break;
        case "publish":
          value = await this.#adapters.publish(run, resourceId, call);
          break;
      }
    } catch {
      append(run, { kind: "execution", decisionSequence, outcome: "failed" });
      return { decision, execution: "failed", decisionSequence };
    }

    append(run, { kind: "execution", decisionSequence, outcome: "succeeded" });
    return { decision, execution: "succeeded", decisionSequence, value };
  }

  recordDocument(runId: string, evidence: Event<Extract<ReportEvent, { kind: "document" | "signal" }>>): void {
    const run = this.#runs.get(runId);
    if (!run) throw new Error("Replay run missing");
    append(run, evidence);
  }

  evidence(runId: string): { events: ReportEvent[]; adapterEffects: AdapterEffects } {
    const run = this.#runs.get(runId);
    if (!run) throw new Error("Replay run missing");
    const invocations = tools.flatMap((tool) =>
      Array.from(run.calls[tool], ([resourceId, count]) => ({ tool, resourceId, count })),
    );
    const writes = Array.from(run.sinks, ([destinationId, messages]) => ({
      destinationId,
      count: messages.length,
    }));
    return { events: structuredClone(run.events), adapterEffects: { invocations, writes } };
  }

  release(runId: string): void {
    this.#runs.delete(runId);
  }
}
