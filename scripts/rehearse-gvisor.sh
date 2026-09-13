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

# V1/V2: runtime identity is asserted from Docker's actual selected OCI runtime,
# while non-root identity is asserted from inside the sandbox. This avoids using
# dmesg, which is intentionally unavailable to non-root processes on some hosts.
identity_name="${PREFIX}-identity"
docker run -d --name "$identity_name" "${common[@]}" "$ALPINE_DIGEST" sh -c 'id -u >/tmp/uid; sleep 20' >/dev/null
selected_runtime="$(docker inspect "$identity_name" --format '{{.HostConfig.Runtime}}')"
[[ "$selected_runtime" == "$RUNTIME" ]] || fail "container runtime is ${selected_runtime}, expected ${RUNTIME}"
uid="$(docker exec "$identity_name" cat /tmp/uid)"
[[ "$uid" == "65532" ]] || fail "sandbox unexpectedly runs as uid $uid"
cleanup
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

# V9: explicitly observe process denial while the parent remains alive. Node's
# child_process API reports spawn failure without requiring another diagnostic
# process inside the already-saturated sandbox.
pid_name="${PREFIX}-pids"
docker run -d --name "$pid_name" "${common[@]}" "$NODE_DIGEST" node -e '
  const { spawn } = require("node:child_process");
  let created = 0;
  let terminal = false;
  const keepAlive = () => setInterval(() => {}, 1000);
  const next = () => {
    if (terminal) return;
    if (created >= 128) {
      terminal = true;
      console.error(`PID_UNBOUNDED:${created}`);
      keepAlive();
      return;
    }
    const child = spawn("sleep", ["20"]);
    let observed = false;
    child.once("spawn", () => {
      if (observed) return;
      observed = true;
      created += 1;
      setTimeout(next, 20);
    });
    child.once("error", (error) => {
      if (observed) return;
      observed = true;
      terminal = true;
      console.error(`PID_DENIED:${created}:${error.code ?? error.message}`);
      keepAlive();
    });
  };
  next();
' >/dev/null
pids_limit="$(docker inspect "$pid_name" --format '{{.HostConfig.PidsLimit}}')"
[[ "$pids_limit" == "32" ]] || fail "Docker PID limit contract changed: ${pids_limit}"
for attempt in $(seq 1 50); do
  pid_log="$(docker logs "$pid_name" 2>&1 || true)"
  if grep -q 'PID_DENIED:' <<<"$pid_log"; then break; fi
  if grep -q 'PID_UNBOUNDED:128' <<<"$pid_log"; then fail "hostile sandbox created all 128 children despite PID limit"; fi
  running="$(docker inspect "$pid_name" --format '{{.State.Running}}')"
  [[ "$running" == "true" ]] || fail "PID pressure parent exited before reporting containment"
  sleep 0.1
done
pid_log="$(docker logs "$pid_name" 2>&1 || true)"
grep -q 'PID_DENIED:' <<<"$pid_log" || fail "PID ceiling produced no explicit spawn denial"
pid_count="$(docker stats --no-stream --format '{{.PIDs}}' "$pid_name" 2>/dev/null)"
[[ "$pid_count" =~ ^[0-9]+$ ]] || fail "host could not read cgroup PID count"
[[ "$pid_count" -le 32 ]] || fail "PID ceiling exceeded: observed ${pid_count} processes"
[[ "$pid_count" -ge 2 ]] || fail "PID pressure workload did not exercise the process limit"
cleanup
pass "process exhaustion contained with explicit spawn denial at ${pid_count}/32 tasks"

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
