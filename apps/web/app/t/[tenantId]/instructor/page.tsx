import Link from "next/link";
import { getInstructorCohorts } from "@/lib/api";

export default async function InstructorPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const result = await getInstructorCohorts(tenantId);
  return <main>
    <h1>Instructor cohorts</h1>
    <p className="muted">Operational progress is visible here. Competence remains evidence-backed and read-only.</p>
    <div className="grid">
      {result.cohorts.map((cohort) => <article className="card" key={cohort.cohortId}>
        <div className="row"><h3>{cohort.name}</h3><span className="pill">{cohort.status}</span></div>
        <p>{cohort.primaryCourseTitle ?? "No primary learning assignment"}</p>
        <p className="muted">{cohort.activeLearnerCount} active learners</p>
        <Link href={`/t/${tenantId}/instructor/cohorts/${cohort.cohortId}`}>Open cohort</Link>
      </article>)}
      {result.cohorts.length === 0 && <div className="card">No related cohorts.</div>}
    </div>
  </main>;
}
