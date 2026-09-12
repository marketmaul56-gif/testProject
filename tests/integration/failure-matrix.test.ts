import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import { ExperienceReadModel } from "../../packages/platform/db/src/experience-read-model.ts";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ids = {
  tenantA: "00000000-0000-7000-8000-000000000301",
  tenantB: "00000000-0000-7000-8000-000000000302",
  learnerA: "00000000-0000-7000-8000-000000000303",
  learnerB: "00000000-0000-7000-8000-000000000304",
  skill: "00000000-0000-7000-8000-000000000305",
  course: "00000000-0000-7000-8000-000000000306",
  courseVersion: "00000000-0000-7000-8000-000000000307",
  chapter: "00000000-0000-7000-8000-000000000308",
  lesson: "00000000-0000-7000-8000-000000000309",
  practice: "00000000-0000-7000-8000-00000000030a",
  revision: "00000000-0000-7000-8000-00000000030b",
  submission: "00000000-0000-7000-8000-00000000030c",
} as const;

before(async () => {
  await pool.query(`
    INSERT INTO tenants (id, slug) VALUES
      ('${ids.tenantA}', 'failure-a'),
      ('${ids.tenantB}', 'failure-b');
    INSERT INTO members (id, tenant_id, auth_user_id, display_name) VALUES
      ('${ids.learnerA}', '${ids.tenantA}', 'failure-learner-a', 'Failure Learner A'),
      ('${ids.learnerB}', '${ids.tenantB}', 'failure-learner-b', 'Failure Learner B');
    INSERT INTO skills (id, tenant_id, key, name)
      VALUES ('${ids.skill}', '${ids.tenantA}', 'failure-skill', 'Failure Skill');
    INSERT INTO courses (id, tenant_id, key)
      VALUES ('${ids.course}', '${ids.tenantA}', 'failure-course');
    INSERT INTO course_versions (id, tenant_id, course_id, version, status, title, published_at)
      VALUES ('${ids.courseVersion}', '${ids.tenantA}', '${ids.course}', 1, 'PUBLISHED', 'Failure Course', now());
    INSERT INTO chapter_versions (id, tenant_id, course_version_id, position, title)
      VALUES ('${ids.chapter}', '${ids.tenantA}', '${ids.courseVersion}', 1, 'Failure Chapter');
    INSERT INTO lesson_versions (id, tenant_id, chapter_version_id, position, title, content)
      VALUES ('${ids.lesson}', '${ids.tenantA}', '${ids.chapter}', 1, 'Failure Lesson', '{}'::jsonb);
    INSERT INTO practice_definitions (id, tenant_id, lesson_version_id, key)
      VALUES ('${ids.practice}', '${ids.tenantA}', '${ids.lesson}', 'failure-practice');
    INSERT INTO practice_revisions (id, tenant_id, practice_id, skill_id, revision_number, definition)
      VALUES ('${ids.revision}', '${ids.tenantA}', '${ids.practice}', '${ids.skill}', 1, '{}'::jsonb);
  `);
});

after(async () => { await pool.end(); });

test("database statement timeout is an infrastructure error and leaves no learner authority mutation", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '20ms'");
    await assert.rejects(() => client.query("SELECT pg_sleep(0.20)"), /statement timeout|canceling statement/i);
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
  const authority = await pool.query(
    `SELECT
       (SELECT count(*)::integer FROM verification_results WHERE tenant_id=$1) AS results,
       (SELECT count(*)::integer FROM skill_evidence WHERE tenant_id=$1) AS evidence,
       (SELECT count(*)::integer FROM competency_states WHERE tenant_id=$1) AS competencies`,
    [ids.tenantA],
  );
  assert.deepEqual(authority.rows[0], { results: 0, evidence: 0, competencies: 0 });
});

test("competency read dependency failure is surfaced and never fabricates competence", async () => {
  const faultPool = {
    query(text: string, values?: readonly unknown[]) {
      if (text.includes("FROM competency_states")) {
        return Promise.reject(new Error("simulated competency read dependency unavailable"));
      }
      return pool.query(text, values ? [...values] : undefined);
    },
  } as unknown as Pool;
  const readModel = new ExperienceReadModel(faultPool);
  await assert.rejects(
    () => readModel.getLearnerOverview(ids.tenantA, ids.learnerA),
    /competency read dependency unavailable/,
  );
  const evidence = await pool.query(
    `SELECT count(*)::integer AS count FROM skill_evidence WHERE tenant_id=$1 AND learner_id=$2`,
    [ids.tenantA, ids.learnerA],
  );
  assert.equal(evidence.rows[0].count, 0);
});

test("duplicate submission request cannot create duplicate learner submission", async () => {
  await pool.query(
    `INSERT INTO practice_submissions
       (id, tenant_id, learner_id, practice_revision_id, attempt_number, request_id, artifact)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 1, 'duplicate-submit', '{}'::jsonb)`,
    [ids.submission, ids.tenantA, ids.learnerA, ids.revision],
  );
  await assert.rejects(
    () => pool.query(
      `INSERT INTO practice_submissions
         (id, tenant_id, learner_id, practice_revision_id, attempt_number, request_id, artifact)
       VALUES ('00000000-0000-7000-8000-00000000030d', $1::uuid, $2::uuid, $3::uuid, 2, 'duplicate-submit', '{}'::jsonb)`,
      [ids.tenantA, ids.learnerA, ids.revision],
    ),
    /duplicate key|unique constraint/i,
  );
  const count = await pool.query(
    `SELECT count(*)::integer AS count FROM practice_submissions
      WHERE tenant_id=$1 AND learner_id=$2 AND practice_revision_id=$3 AND request_id='duplicate-submit'`,
    [ids.tenantA, ids.learnerA, ids.revision],
  );
  assert.equal(count.rows[0].count, 1);
});

test("cross-tenant submission reference is rejected by persistence boundary", async () => {
  await assert.rejects(
    () => pool.query(
      `INSERT INTO practice_submissions
         (id, tenant_id, learner_id, practice_revision_id, attempt_number, request_id, artifact)
       VALUES ('00000000-0000-7000-8000-00000000030e', $1::uuid, $2::uuid, $3::uuid, 1, 'cross-tenant-submit', '{}'::jsonb)`,
      [ids.tenantB, ids.learnerB, ids.revision],
    ),
    /foreign key constraint/i,
  );
});
