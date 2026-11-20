# Agent Firewall v0.1

Agent Firewall is an offline, scripted security gateway demo for technical reviewers. It demonstrates that a server-owned grant can block an unauthorized tool call before the adapter executes. The demo uses synthetic documents and records and an in-memory sink.

| Replay | Authorization | Independently observed effects |
| --- | --- | --- |
| Benign document | Allow the document read and publish to `team-review` | Two adapter entries and one approved sink write |
| Suspicious document | Allow the document read. Deny the private record read and publish to `external-inbox`. | One document adapter entry, zero private record and publish adapter entries, and zero sink writes |

The highlighted `FIXTURE_INJECTION_SIGNAL` is a deterministic marker linked to the document read. Turning it off leaves the denials unchanged. The denied publish uses public fixture text so destination authorization is tested independently of the denied read. A separate positive test verifies that an authorized grant can read the synthetic private record.

The dashboard and JSON export show the same event and adapter evidence. The demonstrated claims cover the two scripted authorization decisions. Live-model behavior, general-purpose injection detection, and end-to-end exfiltration prevention are outside the demonstrated coverage.

See the [demo walkthrough](../../README.md#walkthrough) and [architecture and threat model](architecture.md).
