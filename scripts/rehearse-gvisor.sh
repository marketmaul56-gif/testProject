#!/usr/bin/env bash
set -euo pipefail

RUNTIME="${GVISOR_RUNTIME:-runsc}"
ALPINE_TAG="${GVISOR_ALPINE_IMAGE:-alpine:3.22}"
NODE_TAG="${GVISOR_NODE_IMAGE:-node:24-alpine}"
PREFIX="m12-gvisor-${GITHUB_RUN_ID:-local}-$$"

cleanup() {
  docker ps -a --format '{{.Names}}' | grep "^${PREFIX}" | xargs -r docker rm -f >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() { echo "gVisor rehearsal FAILED: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

runtime_json="$(docker info --format '{{json .Runtimes}}')"
grep -q 'runsc' <<<"$runtime_json" || fail "Docker runsc runtime is not registered"
runsc --version

docker pull "$ALPINE_TAG" >/dev/null
docker pull "$NODE_TAG" >/dev/null
ALPINE_DIGEST="$(docker image inspect "$ALPINE_TAG" --format '{{index .RepoDigests 0}}')"
NODE_DIGEST="$(docker image inspect "$NODE_TAG" --format '{{index .RepoDigests 0}}')"
[[ "$ALPINE_DIGEST" == *@sha256:* ]] || fail "Alpine digest resolution failed"
[[ "$NODE_DIGEST" == *@sha256:* ]] || fail "Node digest resolution failed"
pass "runtime images resolved to immutable digests"

common=(--runtime="$RUNTIME" --network=none --cpus=0.5 --memory=64m --memory-swap=64m --pids-limit=32 --read-only --tmpfs /tmp:rw,nosuid,nodev,size=16m --user 65532:65532 --security-opt no-new-privileges)

# V1/V2: runtime identity and non-root execution.
uid="$(docker run --rm "${common[@]}" "$ALPINE_DIGEST" id -u)"
[[ "$uid" == "65532" ]] || fail "sandbox unexpectedly runs as uid $uid"
docker run --rm "${common[@]}" "$ALPINE_DIGEST" dmesg 2>&1 | grep -qi 'gVisor' || fail "sandbox did not identify gVisor kernel surface"
pass "runsc sandbox and non-root identity verified"

# V3: no production/application credentials are inherited into hostile code.
export M12_HOST_SECRET_SHOULD_NOT_LEAK="forbidden-secret-marker"
if docker run --rm "${common[@]}" "$ALPINE_DIGEST" sh -c 'env | grep -q forbidden-secret-marker'; then
  fail "host environment leaked into sandbox"
fi
pass "host credentials/environment are not inherited"

# V4/V5: network and metadata/private endpoint denial.
if docker run --rm "${common[@]}" "$ALPINE_DIGEST" sh -c 'wget -T 2 -qO- http://169.254.169.254/ >/dev/null 2>&1'; then
  fail "metadata endpoint reachable with network disabled"
fi
if docker run --rm "${common[@]}" "$ALPINE_DIGEST" sh -c 'wget -T 2 -qO- http://1.1.1.1/ >/dev/null 2>&1'; then
  fail "external network reachable with network disabled"
fi
pass "metadata/private/external network access denied"

# V6: readonly root filesystem; only explicit ephemeral tmpfs is writable.
if docker run --rm "${common[@]}" "$ALPINE_DIGEST" sh -c 'touch /escape-attempt'; then
  fail "readonly root filesystem was writable"
fi
docker run --rm "${common[@]}" "$ALPINE_DIGEST" sh -c 'echo ok >/tmp/ephemeral && test "$(cat /tmp/ephemeral)" = ok'
pass "root filesystem readonly and ephemeral scratch isolated"

# V7: wall-clock bound on an infinite loop.
set +e
timeout --signal=KILL 4s docker run --rm --name "${PREFIX}-loop" "${common[@]}" "$ALPINE_DIGEST" sh -c 'while :; do :; done' >/dev/null 2>&1
loop_rc=$?
set -e
[[ $loop_rc -ne 0 ]] || fail "infinite loop escaped wall-clock termination"
cleanup
pass "infinite loop terminated without host impact"

# V8: memory bomb remains inside the sandbox/cgroup.
set +e
timeout --signal=KILL 8s docker run --rm --name "${PREFIX}-memory" "${common[@]}" "$NODE_DIGEST" node -e 'const x=[]; for (;;) x.push(Buffer.alloc(8*1024*1024,1));' >/dev/null 2>&1
memory_rc=$?
set -e
[[ $memory_rc -ne 0 ]] || fail "memory bomb unexpectedly completed successfully"
cleanup
pass "memory exhaustion contained"

# V9: spawn pressure must observe explicit process denial before 128 children.
# The test succeeds only when the sandbox/cgroup refuses new processes.
pid_result="$(timeout --signal=KILL 10s docker run --rm --name "${PREFIX}-pids" "${common[@]}" "$NODE_DIGEST" node -e '
  const { spawn } = require("node:child_process");
  let settled = 0, denied = 0;
  const total = 128;
  const finish = () => {
    if (++settled !== total) return;
    process.stdout.write(JSON.stringify({ denied }));
    process.exit(denied > 0 ? 0 : 42);
  };
  for (let i = 0; i < total; i++) {
    const child = spawn("sh", ["-c", "sleep 1"]);
    child.once("error", () => { denied++; finish(); });
    child.once("exit", finish);
  }
')" || fail "PID containment probe timed out or observed no spawn denial"
grep -Eq '"denied":[1-9][0-9]*' <<<"$pid_result" || fail "PID quota did not deny excess processes"
cleanup
pass "process exhaustion contained with explicit spawn denial"

# V10: hidden verifier material is not on the default learner execution surface.
mkdir -p "${RUNNER_TEMP:-/tmp}/${PREFIX}-hidden"
printf '%s' 'M12_HIDDEN_TEST_CANARY' >"${RUNNER_TEMP:-/tmp}/${PREFIX}-hidden/secret"
if docker run --rm "${common[@]}" "$ALPINE_DIGEST" sh -c 'test -e /opt/verification-input/secret'; then
  fail "hidden verifier input appeared on untrusted default surface"
fi
rm -rf "${RUNNER_TEMP:-/tmp}/${PREFIX}-hidden"
pass "hidden verifier input absent from untrusted default surface"

# V11: bound hostile stdout capture. Disable pipefail inside this subshell because
# head intentionally closes the producer pipe after the locked byte limit.
bytes="$(set +o pipefail; timeout 3s docker run --rm "${common[@]}" "$ALPINE_DIGEST" sh -c 'yes X' 2>/dev/null | head -c 65536 | wc -c)"
[[ "$bytes" -eq 65536 ]] || fail "bounded output rehearsal returned unexpected byte count"
pass "host remains responsive under hostile output"

# V12: cleanup and post-attack host/runtime health.
cleanup
if docker ps -a --format '{{.Names}}' | grep -q "^${PREFIX}"; then
  fail "sandbox cleanup left containers behind"
fi
docker info >/dev/null
docker run --rm "${common[@]}" "$ALPINE_DIGEST" sh -c 'echo healthy' | grep -q healthy
pass "sandbox cleanup complete and host/runtime remain healthy"

echo "GVISOR_REHEARSAL_PASS runtime=$RUNTIME alpine=$ALPINE_DIGEST node=$NODE_DIGEST"
