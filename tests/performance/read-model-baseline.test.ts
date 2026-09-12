import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { Pool } from "pg";
import { uuidV7 } from "../../packages/platform/audit/src/security-audit.ts";
import { ExperienceReadModel } from "../../packages/platform/db/src/experience-read-model.ts";

const ids = {
  tenant: "00000000-0000-7000-8000-000000000401",
  instructor: "00000000-0000-7000-8000-000000000402",
  course: "00000000-0000-7000-8000-000000000403",
  courseVersion: "00000000-0000-7000-8000-000000000404",
  chapter: "00000000-0000-7000-8000-000000000405",
  cohort: "00000000-0000-7000-8000-000000000406",
  assignment: "00000000-0000-7000-8000-000000000407",
  instructorRole: "00000000-0000-7000-8000-000000000408",
} as const;

type Metric = Readonly<{ p50Ms: number; p95Ms: number; maxMs: number; samples: number }>;

function percentile(sorted: readonly number[], ratio: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? 0;
}

async function measure(run: () => Promise<unknown>, samples: number): Promise<Metric> {
  for (let warmup = 0; warmup < 5; warmup += 1) await run();
  const durations: number[] = [];
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now();
    await run();
    durations.push(performance.now() - started);
  }
  durations.sort((a, b) => a - b);
  return {
    p50Ms: Number(percentile(durations, 0.50).toFixed(2)),
    p95Ms: Number(percentile(durations, 0.95).toFixed(2)),
    maxMs: Number((durations.at(-1) ?? 0).toFixed(2)),
    samples,
  };
}

test("measure core learner and instructor read-model baseline on representative MVP data", async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  try {
    await pool.query(`
      INSERT INTO tenants (id, slug) VALUES ('${ids.tenant}', 'performance-baseline');
      INSERT INTO members (id, tenant_id, auth_user_id, display_name)
        VALUES ('${ids.instructor}', '${ids.tenant}', 'perf-instructor', 'Performance Instructor');
      INSERT INTO member_roles (tenant_id, member_id, role)
        VALUES ('${ids.tenant}', '${ids.instructor}', 'INSTRUCTOR');
      INSERT INTO courses (id, tenant_id, key)
        VALUES ('${ids.course}', '${ids.tenant}', 'performance-course');
      INSERT INTO course_versions (id, tenant_id, course_id, version, status, title, published_at)
        VALUES ('${ids.courseVersion}', '${ids.tenant}', '${ids.course}', 1, 'PUBLISHED', 'Performance Course', now());
      INSERT INTO chapter_versions (id, tenant_id, course_version_id, position, title)
        VALUES ('${ids.chapter}', '${ids.tenant}', '${ids.courseVersion}', 1, 'Performance Chapter');
      INSERT INTO cohorts (id, tenant_id, key, name)
        VALUES ('${ids.cohort}', '${ids.tenant}', 'performance-cohort', 'Performance Cohort');
      INSERT INTO learning_assignments (id, tenant_id, cohort_id, course_version_id, is_primary, assigned_at)
        VALUES ('${ids.assignment}', '${ids.tenant}', '${ids.cohort}', '${ids.courseVersion}', true, now());
      UPDATE cohorts SET status='ACTIVE', version=1 WHERE id='${ids.cohort}' AND tenant_id='${ids.tenant}';
      INSERT INTO instructor_cohort_roles (id, tenant_id, cohort_id, instructor_id)
        VALUES ('${ids.instructorRole}', '${ids.tenant}', '${ids.cohort}', '${ids.instructor}');
    `);

    const lessonIds: string[] = [];
    for (let position = 1; position <= 20; position += 1) {
      const lessonId = uuidV7(1_800_000_000_000 + position);
      lessonIds.push(lessonId);
      await pool.query(
        `INSERT INTO lesson_versions (id, tenant_id, chapter_version_id, position, title, content)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, '{}'::jsonb)`,
        [lessonId, ids.tenant, ids.chapter, position, `Lesson ${position}`],
      );
    }

    const learnerIds: string[] = [];
    for (let learnerIndex = 0; learnerIndex < 50; learnerIndex += 1) {
      const learnerId = uuidV7(1_800_000_100_000 + learnerIndex);
      const membershipId = uuidV7(1_800_000_200_000 + learnerIndex);
      learnerIds.push(learnerId);
      await pool.query(
        `INSERT INTO members (id, tenant_id, auth_user_id, display_name)
         VALUES ($1::uuid, $2::uuid, $3, $4)`,
        [learnerId, ids.tenant, `perf-learner-${learnerIndex}`, `Learner ${learnerIndex}`],
      );
      await pool.query(
        `INSERT INTO cohort_memberships (id, tenant_id, cohort_id, learner_id, status, enrolled_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'ENROLLED', now())`,
        [membershipId, ids.tenant, ids.cohort, learnerId],
      );
      for (let lessonIndex = 0; lessonIndex < lessonIds.length; lessonIndex += 1) {
        const progressId = uuidV7(1_800_001_000_000 + learnerIndex * 100 + lessonIndex);
        await pool.query(
          `INSERT INTO lesson_progress (id, tenant_id, learner_id, lesson_version_id, state, updated_at)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'COMPLETED', now())`,
          [progressId, ids.tenant, learnerId, lessonIds[lessonIndex]],
        );
      }
    }

    const readModel = new ExperienceReadModel(pool);
    const learnerId = learnerIds[0];
    assert.ok(learnerId);
    const learnerMetric = await measure(
      () => readModel.getLearnerOverview(ids.tenant, learnerId),
      30,
    );
    const instructorMetric = await measure(
      () => readModel.getInstructorCohortOverview(ids.tenant, ids.instructor, ids.cohort),
      20,
    );

    assert.equal(learnerMetric.samples, 30);
    assert.equal(instructorMetric.samples, 20);
    assert.ok(Number.isFinite(learnerMetric.p95Ms));
    assert.ok(Number.isFinite(instructorMetric.p95Ms));

    console.log(`M12_PERF_BASELINE ${JSON.stringify({
      targetStatus: "M11_NUMERIC_TARGETS_NOT_RECOVERED",
      dataset: { learners: 50, lessons: 20, progressRows: 1000 },
      learnerOverview: learnerMetric,
      instructorCohortOverview: instructorMetric,
    })}`);
  } finally {
    await pool.end();
  }
});
