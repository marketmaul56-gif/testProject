import Link from "next/link";
import { getInstructorCohort } from "@/lib/api";

export default async function CohortPage({ params }: { params: Promise<{ tenantId: string; cohortId: string }> }) {
  const { tenantId, cohortId } = await params;
  const result = await getInstructorCohort(tenantId, cohortId);
  return <main>
    <div className="row"><div><h1>{result.cohort.name}</h1><p className="muted">{result.cohort.primaryCourseTitle ?? "No primary assignment"}</p></div><span className="pill">{result.cohort.status}</span></div>
    <h2>Roster & operational progress</h2>
    <table><thead><tr><th>Learner</th><th>Learning progress</th><th>Submissions</th><th>Evidence</th><th></th></tr></thead>
      <tbody>{result.roster.map((learner) => <tr key={learner.learnerId}>
        <td>{learner.displayName ?? learner.learnerId}</td>
        <td>{learner.completedLessons}/{learner.totalLessons} lessons</td>
        <td>{learner.submissionCount}</td>
        <td>{learner.evidenceCount}</td>
        <td><Link href={`/t/${tenantId}/instructor/cohorts/${cohortId}/learners/${learner.learnerId}`}>Review</Link></td>
      </tr>)}</tbody>
    </table>
    <p className="muted">Lesson completion and submission counts are operational signals, not competence.</p>
  </main>;
}
