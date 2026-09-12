import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import {
  CohortConcurrencyError,
  PgCohortOperations,
  PrimaryAssignmentConflictError,
} from "../../packages/modules/cohorts/src/infrastructure/pg-cohort-operations.ts";

const id = {
  tenantA: "00000000-0000-7000-8000-000000000101",
  tenantB: "00000000-0000-7000-8000-000000000102",
  learnerA: "00000000-0000-7000-8000-000000000103",
  learnerB: "00000000-0000-7000-8000-000000000104",
  course: "00000000-0000-7000-8000-000000000105",
  publishedOne: "00000000-0000-7000-8000-000000000106",
  publishedTwo: "00000000-0000-7000-8000-000000000107",
  draftVersion: "00000000-0000-7000-8000-000000000108",
  cohort: "00000000-0000-7000-8000-000000000109",
  emptyCohort: "00000000-0000-7000-8000-00000000010a",
  cancelledCohort: "00000000-0000-7000-8000-00000000010b",
  assignment: "00000000-0000-7000-8000-00000000010c",
  duplicateAssignment: "00000000-0000-7000-8000-00000000010d",
  membershipOne: "00000000-0000-7000-8000-00000000010e",
  duplicateMembership: "00000000-0000-7000-8000-00000000010f",
  membershipTwo: "00000000-0000-7000-8000-000000000110",
  crossTenantMembership: "00000000-0000-7000-8000-000000000111",
} as const;

test("cohort operations preserve lifecycle, published assignment, historical membership and non-authority", async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const operations = new PgCohortOperations(pool);
  try {
    await pool.query(`
      INSERT INTO tenants (id, slug) VALUES
        ('${id.tenantA}', 'cohort-ops-a'),
        ('${id.tenantB}', 'cohort-ops-b');
      INSERT INTO members (id, tenant_id, auth_user_id, display_name) VALUES
        ('${id.learnerA}', '${id.tenantA}', 'cohort-learner-a', 'Learner A'),
        ('${id.learnerB}', '${id.tenantB}', 'cohort-learner-b', 'Learner B');
      INSERT INTO courses (id, tenant_id, key)
        VALUES ('${id.course}', '${id.tenantA}', 'cohort-course');
      INSERT INTO course_versions (id, tenant_id, course_id, version, status, title, published_at) VALUES
        ('${id.publishedOne}', '${id.tenantA}', '${id.course}', 1, 'PUBLISHED', 'Published One', now()),
        ('${id.publishedTwo}', '${id.tenantA}', '${id.course}', 2, 'PUBLISHED', 'Published Two', now()),
        ('${id.draftVersion}', '${id.tenantA}', '${id.course}', 3, 'DRAFT', 'Draft Three', NULL);
      INSERT INTO cohorts (id, tenant_id, key, name) VALUES
        ('${id.cohort}', '${id.tenantA}', 'main', 'Main Cohort'),
        ('${id.emptyCohort}', '${id.tenantA}', 'empty', 'Empty Cohort'),
        ('${id.cancelledCohort}', '${id.tenantA}', 'cancelled', 'Cancelled Cohort');
    `);

    await assert.rejects(
      operations.transition({ tenantId: id.tenantA, cohortId: id.emptyCohort, expectedVersion: 0, to: "ACTIVE" }),
      /requires exactly one primary published learning assignment/,
    );

    await assert.rejects(
      operations.assignPrimaryLearning({
        id: id.assignment,
        tenantId: id.tenantA,
        cohortId: id.cohort,
        courseVersionId: id.draftVersion,
        assignedAt: new Date(),
      }),
      /requires a published immutable learning version/,
    );

    const assigned = await operations.assignPrimaryLearning({
      id: id.assignment,
      tenantId: id.tenantA,
      cohortId: id.cohort,
      courseVersionId: id.publishedOne,
      assignedAt: new Date(),
    });
    assert.equal(assigned.created, true);

    const duplicateAssignment = await operations.assignPrimaryLearning({
      id: id.duplicateAssignment,
      tenantId: id.tenantA,
      cohortId: id.cohort,
      courseVersionId: id.publishedOne,
      assignedAt: new Date(),
    });
    assert.equal(duplicateAssignment.created, false);
    assert.equal(duplicateAssignment.id, id.assignment);

    await assert.rejects(
      operations.assignPrimaryLearning({
        id: id.duplicateAssignment,
        tenantId: id.tenantA,
        cohortId: id.cohort,
        courseVersionId: id.publishedTwo,
        assignedAt: new Date(),
      }),
      PrimaryAssignmentConflictError,
    );

    const active = await operations.transition({
      tenantId: id.tenantA,
      cohortId: id.cohort,
      expectedVersion: 0,
      to: "ACTIVE",
    });
    assert.equal(active.status, "ACTIVE");
    assert.equal(active.version, 1);

    await assert.rejects(
      operations.transition({ tenantId: id.tenantA, cohortId: id.cohort, expectedVersion: 0, to: "COMPLETED" }),
      CohortConcurrencyError,
    );

    await assert.rejects(
      pool.query(
        `UPDATE learning_assignments SET course_version_id = $3::uuid
          WHERE tenant_id = $1::uuid AND cohort_id = $2::uuid`,
        [id.tenantA, id.cohort, id.publishedTwo],
      ),
      /immutable after cohort activation|only be configured while cohort is DRAFT/,
    );

    const firstEnrollment = await operations.enrollLearner({
      id: id.membershipOne,
      tenantId: id.tenantA,
      cohortId: id.cohort,
      learnerId: id.learnerA,
      enrolledAt: new Date(),
    });
    assert.equal(firstEnrollment.created, true);

    const duplicateEnrollment = await operations.enrollLearner({
      id: id.duplicateMembership,
      tenantId: id.tenantA,
      cohortId: id.cohort,
      learnerId: id.learnerA,
      enrolledAt: new Date(),
    });
    assert.equal(duplicateEnrollment.created, false);
    assert.equal(duplicateEnrollment.id, firstEnrollment.id);

    const removed = await operations.removeEnrollment({
      tenantId: id.tenantA,
      membershipId: firstEnrollment.id,
      removedAt: new Date(),
    });
    assert.equal(removed.status, "REMOVED");
    assert.ok(removed.removedAt instanceof Date);

    const removedRetry = await operations.removeEnrollment({
      tenantId: id.tenantA,
      membershipId: firstEnrollment.id,
      removedAt: new Date(),
    });
    assert.equal(removedRetry.status, "REMOVED");

    const reenrolled = await operations.enrollLearner({
      id: id.membershipTwo,
      tenantId: id.tenantA,
      cohortId: id.cohort,
      learnerId: id.learnerA,
      enrolledAt: new Date(),
    });
    assert.equal(reenrolled.created, true);
    assert.notEqual(reenrolled.id, firstEnrollment.id);

    const history = await pool.query(
      `SELECT id, status FROM cohort_memberships
        WHERE tenant_id = $1::uuid AND cohort_id = $2::uuid AND learner_id = $3::uuid
        ORDER BY enrolled_at, id`,
      [id.tenantA, id.cohort, id.learnerA],
    );
    assert.equal(history.rowCount, 2);
    assert.deepEqual(history.rows.map((row) => row.status).sort(), ["ENROLLED", "REMOVED"]);

    await assert.rejects(
      pool.query(
        `UPDATE cohort_memberships SET status = 'ENROLLED', removed_at = NULL
          WHERE tenant_id = $1::uuid AND id = $2::uuid`,
        [id.tenantA, firstEnrollment.id],
      ),
      /membership transition must be ENROLLED -> REMOVED/,
    );

    await assert.rejects(
      operations.enrollLearner({
        id: id.crossTenantMembership,
        tenantId: id.tenantA,
        cohortId: id.cohort,
        learnerId: id.learnerB,
        enrolledAt: new Date(),
      }),
      /cohort_memberships_learner_same_tenant_fk/,
    );

    const authorityBefore = await pool.query(
      `SELECT
         (SELECT count(*)::integer FROM skill_evidence WHERE tenant_id = $1::uuid) AS evidence_count,
         (SELECT count(*)::integer FROM competency_states WHERE tenant_id = $1::uuid) AS competency_count`,
      [id.tenantA],
    );

    const completed = await operations.transition({
      tenantId: id.tenantA,
      cohortId: id.cohort,
      expectedVersion: 1,
      to: "COMPLETED",
    });
    assert.equal(completed.version, 2);

    const authorityAfter = await pool.query(
      `SELECT
         (SELECT count(*)::integer FROM skill_evidence WHERE tenant_id = $1::uuid) AS evidence_count,
         (SELECT count(*)::integer FROM competency_states WHERE tenant_id = $1::uuid) AS competency_count`,
      [id.tenantA],
    );
    assert.deepEqual(authorityAfter.rows[0], authorityBefore.rows[0]);

    const archived = await operations.transition({
      tenantId: id.tenantA,
      cohortId: id.cohort,
      expectedVersion: 2,
      to: "ARCHIVED",
    });
    assert.equal(archived.version, 3);
    await assert.rejects(
      operations.transition({ tenantId: id.tenantA, cohortId: id.cohort, expectedVersion: 3, to: "ACTIVE" }),
      /invalid cohort lifecycle transition/,
    );

    const cancelled = await operations.transition({
      tenantId: id.tenantA,
      cohortId: id.cancelledCohort,
      expectedVersion: 0,
      to: "ARCHIVED",
    });
    assert.equal(cancelled.status, "ARCHIVED");
    assert.equal(cancelled.version, 1);
  } finally {
    await pool.end();
  }
});
