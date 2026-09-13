import fs from 'node:fs';
import process from 'node:process';

const policyPath = process.argv[2] ?? 'infrastructure/deployment/go-live-gate.json';
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(policy.schemaVersion === 1, 'unsupported go-live policy schema');
assert(policy.executionMode === 'provider-neutral-rehearsal', 'unexpected execution mode');
assert(policy.liveProviderExecution === 'DEFERRED', 'live provider execution must remain DEFERRED');
assert(policy.publicTraffic === 'DEFERRED', 'public traffic must remain DEFERRED');
assert(policy.decision === 'NO_GO_LIVE_TRAFFIC__READINESS_BASELINE_PASS', 'decision must not claim live go-live');

for (const milestone of ['PR.3', 'PR.4']) {
  assert(policy.requiredLockedMilestones.includes(milestone), `${milestone} must be a prerequisite`);
}

for (const [name, status] of Object.entries(policy.offlineGates)) {
  assert(status === 'PASS', `offline gate ${name} must PASS`);
}

for (const [name, status] of Object.entries(policy.liveEnvironmentGates)) {
  assert(status === 'DEFERRED', `live environment gate ${name} must remain DEFERRED`);
}

assert(policy.authority.completionIsCompetence === false, 'completion cannot become competence');
assert(policy.authority.aiCanPassFail === false, 'AI cannot become PASS/FAIL authority');
assert(policy.authority.adminCanCreateEvidence === false, 'admin cannot create evidence');
assert(policy.authority.instructorCanCreateEvidence === false, 'instructor cannot create evidence');
assert(policy.authority.evidenceAuthority === 'authoritative-verification-only', 'evidence authority drift');
assert(policy.authority.competencyProjection === 'deterministic-read-only', 'competency projection drift');

console.log(JSON.stringify({
  status: 'PASS',
  decision: policy.decision,
  liveTraffic: policy.publicTraffic,
  liveProviderExecution: policy.liveProviderExecution
}));
