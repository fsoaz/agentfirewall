const $ = (id) => document.getElementById(id);
let currentReport;

const reasons = {
  GRANT_MATCH: "Exact permission matched",
  INVALID_ARGUMENTS: "Invalid tool arguments",
  UNKNOWN_TOOL: "Unknown tool",
  MISSING_GRANT: "Run grant missing",
  RESOURCE_NOT_FOUND: "Resource missing",
  RESOURCE_NOT_GRANTED: "Resource outside the run grant",
  POLICY_ERROR: "Policy evaluation failed",
};

const outcomeLabels = {
  not_dispatched: "Never dispatched",
  succeeded: "Executed",
  failed: "Execution failed",
};

const checkLabels = {
  document_reads: "Document read calls",
  private_record_reads: "Private record read calls",
  publish_calls: "Publish calls",
  destination_writes: "Sink writes",
};

function element(tag, value, className) {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
}

function renderDocument(events) {
  const source = events.find((event) => event.kind === "document");
  const signal = events.find((event) =>
    event.kind === "signal" && event.readSequence === source?.readSequence,
  );
  $("document-id").textContent = source ? `${source.documentId} · Read #${source.readSequence}` : "";
  $("signal").hidden = !signal;
  if (source && signal) {
    $("document-text").replaceChildren(
      source.text.slice(0, signal.start),
      element("mark", source.text.slice(signal.start, signal.end)),
      source.text.slice(signal.end),
    );
    $("signal-code").textContent = signal.code;
  } else {
    $("document-text").textContent = source?.text ?? "No document returned.";
  }
}

function renderDecisions(decisions, outcomes) {
  $("decisions").replaceChildren(...decisions.map((event) => {
    const article = element("article", "", "decision");
    const title = element("div", "", "decision-title");
    const permitted = event.decision.type === "allow";
    title.append(
      element("span", `#${event.sequence}`, "event-number"),
      element("code", event.tool ?? "Unknown tool"),
      element("span", permitted ? "Allowed" : "Blocked", `badge ${permitted ? "allowed" : "blocked"}`),
    );
    const detail = element("div", "", "decision-detail");
    const outcome = outcomes.get(event.sequence);
    detail.append(
      element("span", reasons[event.decision.reasonCode]),
      element("span", outcomeLabels[outcome]),
    );
    const meta = element("div", "", "decision-meta");
    if (event.resourceId) meta.append(element("code", event.resourceId));
    meta.append(element("code", event.decision.reasonCode));
    article.append(title, detail, meta);
    return article;
  }));
}

function render(report) {
  const decisions = report.events.filter((event) => event.kind === "decision");
  const outcomes = new Map(report.events.filter((event) => event.kind === "execution")
    .map((event) => [event.decisionSequence, event.outcome]));
  $("proposed").textContent = decisions.length;
  $("blocked").textContent = decisions.filter((event) => event.decision.type === "deny").length;
  $("invocations").textContent = report.adapterEffects.invocations.reduce((total, row) => total + row.count, 0);
  $("writes").textContent = report.adapterEffects.writes.reduce((total, row) => total + row.count, 0);
  renderDocument(report.events);
  renderDecisions(decisions, outcomes);

  $("evidence").replaceChildren(...report.invariants.map((check) => {
    const row = element("li", "", "check");
    const label = element("span", checkLabels[check.id]);
    label.append(element("code", check.resourceId));
    row.append(
      label,
      element("strong", `${check.observed} / ${check.expected}`),
      element("span", check.passed ? "Pass" : "Fail", `badge ${check.passed ? "allowed" : "blocked"}`),
    );
    return row;
  }));
  const passed = report.invariants.filter((check) => check.passed).length;
  $("invariants").textContent = `${passed} of ${report.invariants.length} checks passed`;
  $("schema").textContent = report.schemaVersion;
  $("run-id").textContent = report.runId;
  $("report").hidden = false;
}

async function runReplay() {
  const scenarioInputs = document.querySelectorAll("input[name='scenario']");
  const scenario = document.querySelector("input[name='scenario']:checked").value;
  $("run").disabled = true;
  $("download").disabled = true;
  $("report").hidden = true;
  $("status").textContent = "Running replay…";
  scenarioInputs.forEach((input) => { input.disabled = true; });
  try {
    const response = await fetch("/api/replays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: scenario }),
    });
    if (!response.ok) throw new Error("Replay request failed");
    currentReport = await response.json();
    render(currentReport);
    $("status").textContent = scenario === "suspicious" ? "Suspicious replay complete" : "Benign replay complete";
    $("download").disabled = false;
  } catch {
    currentReport = undefined;
    $("status").textContent = "Replay failed. Run it again to retry.";
  } finally {
    $("run").disabled = false;
    scenarioInputs.forEach((input) => { input.disabled = false; });
  }
}

$("run").addEventListener("click", runReplay);
$("download").addEventListener("click", () => {
  if (!currentReport) return;
  const blob = new Blob([JSON.stringify(currentReport, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `agent-firewall-${currentReport.scenarioId}-${currentReport.runId}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

runReplay();
