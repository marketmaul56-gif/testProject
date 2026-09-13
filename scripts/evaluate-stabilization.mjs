import assert from 'node:assert/strict';
import fs from 'node:fs';
import process from 'node:process';

const policyPath = 'infrastructure/deployment/stabilization-policy.json';
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));

function validatePolicy() {
  assert.equal(policy.schemaVersion, 1);
  assert.equal(policy.executionMode, 'synthetic-rehearsal');
  assert.equal(policy.liveObservation, 'DEFERRED');
  assert.equal(policy.principles.aiOutageStopsCore, false);
  assert.equal(policy.principles.infrastructureFailureIsLearnerFail, false);
  assert.equal(policy.principles.authorityIntegrityAnomalySeverity, 'P0');
  assert.equal(policy.principles.publicTrafficObserved, false);
}

export function evaluateSnapshot(snapshot) {
  validatePolicy();

  for (const signal of policy.requiredSignals) {
    if (!(signal in snapshot)) return policy.decisions.insufficientSignal;
  }

  for (const signal of policy.requiredSignals.filter((name) => name !== 'aiAvailable')) {
    if (!Number.isFinite(snapshot[signal]) || snapshot[signal] < 0) return policy.decisions.insufficientSignal;
  }
  if (typeof snapshot.aiAvailable !== 'boolean') return policy.decisions.insufficientSignal;

  const t = policy.thresholds;
  if (snapshot.authorityIntegrityAnomalies > t.authorityIntegrityAnomalies) {
    return policy.decisions.authorityP0;
  }

  if (
    snapshot.api5xxErrorRatePct > t.api5xxErrorRatePct ||
    snapshot.verifierInfrastructureErrorRatePct > t.verifierInfrastructureErrorRatePct ||
    snapshot.coreDependencyFailureRatePct > t.coreDependencyFailureRatePct
  ) {
    return policy.decisions.rollback;
  }

  if (
    snapshot.learnerOverviewP95Ms > t.learnerOverviewP95Ms ||
    snapshot.instructorCohortOverviewP95Ms > t.instructorCohortOverviewP95Ms ||
    snapshot.authorityQueueBacklog > t.authorityQueueBacklog
  ) {
    return policy.decisions.investigate;
  }

  if (!snapshot.aiAvailable) return policy.decisions.aiOnlyDegraded;
  return policy.decisions.stable;
}

function healthy(overrides = {}) {
  return {
    api5xxErrorRatePct: 0.2,
    learnerOverviewP95Ms: 80,
    instructorCohortOverviewP95Ms: 150,
    authorityQueueBacklog: 10,
    verifierInfrastructureErrorRatePct: 0,
    coreDependencyFailureRatePct: 0.5,
    authorityIntegrityAnomalies: 0,
    aiAvailable: true,
    ...overrides,
  };
}

function selfTest() {
  const scenarios = [
    ['healthy', healthy(), 'STABLE'],
    ['ai outage only', healthy({ aiAvailable: false }), 'DEGRADED_AI_ONLY_CONTINUE'],
    ['authority anomaly', healthy({ authorityIntegrityAnomalies: 1 }), 'P0_ROLLBACK'],
    ['api errors', healthy({ api5xxErrorRatePct: 2.1 }), 'ROLLBACK_ESCALATE'],
    ['verifier infrastructure errors', healthy({ verifierInfrastructureErrorRatePct: 5.1 }), 'ROLLBACK_ESCALATE'],
    ['core dependency failures', healthy({ coreDependencyFailureRatePct: 5.1 }), 'ROLLBACK_ESCALATE'],
    ['queue backlog', healthy({ authorityQueueBacklog: 101 }), 'HOLD_INVESTIGATE'],
    ['learner read-model latency', healthy({ learnerOverviewP95Ms: 101 }), 'HOLD_INVESTIGATE'],
    ['instructor read-model latency', healthy({ instructorCohortOverviewP95Ms: 201 }), 'HOLD_INVESTIGATE'],
    ['missing signal', (() => { const value = healthy(); delete value.authorityQueueBacklog; return value; })(), 'HOLD_INSUFFICIENT_SIGNAL'],
  ];

  for (const [name, snapshot, expected] of scenarios) {
    const actual = evaluateSnapshot(snapshot);
    assert.equal(actual, expected, `${name}: expected ${expected}, got ${actual}`);
  }

  console.log(JSON.stringify({ status: 'PASS', scenarios: scenarios.length, liveObservation: policy.liveObservation }));
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else if (process.argv[2]) {
  const snapshot = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  console.log(evaluateSnapshot(snapshot));
} else {
  validatePolicy();
  console.log(JSON.stringify({ status: 'PASS', liveObservation: policy.liveObservation }));
}
