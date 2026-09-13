import { getLearnerOverview } from "@/lib/api";
import { submitPracticeAction, submitProjectArtifactAction } from "./actions";

function State({ value }: { value: string }) {
  return <span className="pill" data-state={value}>{value.replaceAll("_", " ")}</span>;
}

function canSubmit(verificationState: string): boolean {
  return verificationState !== "PASSED" && verificationState !== "PENDING" && verificationState !== "RUNNING";
}

export default async function LearnerPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const overview = await getLearnerOverview(tenantId);
  return <main>
    <h1>My learning</h1>
    <p className="muted">Completion tracks learning progress. Verified evidence is what can support competency.</p>

    <h2>Assigned learning</h2>
    <div className="stack">
      {overview.assignedLearning.length === 0 && <div className="card">No active learning assignment.</div>}
      {overview.assignedLearning.map((course) => <section className="card" key={course.courseVersionId}>
        <h3>{course.title}</h3>
        <div className="stack">
          {course.lessons.map((lesson) => <div key={lesson.lessonVersionId} className="learning-item">
            <div className="row"><strong>{lesson.title}</strong><State value={lesson.completionState ?? "NOT_STARTED"} /></div>
            {lesson.practices.map((practice) => <div className="practice-block" key={practice.practiceRevisionId}>
              <div className="row">
                <span>Practice · {practice.key}{practice.attemptNumber ? ` · attempt ${practice.attemptNumber}` : ""}</span>
                <State value={practice.verificationState} />
              </div>
              {canSubmit(practice.verificationState) && <form
                action={submitPracticeAction.bind(null, tenantId, practice.practiceRevisionId)}
                className="submission-form"
              >
                <label htmlFor={`practice-${practice.practiceRevisionId}`}>Your solution</label>
                <textarea
                  id={`practice-${practice.practiceRevisionId}`}
                  name="solution"
                  rows={6}
                  required
                  maxLength={100000}
                  placeholder="Write or paste your solution. The deterministic verifier, not AI, decides PASS/FAIL."
                />
                <button type="submit">Submit practice</button>
              </form>}
              {(practice.verificationState === "PENDING" || practice.verificationState === "RUNNING") &&
                <p className="muted">Authoritative verification is in progress.</p>}
            </div>)}
          </div>)}
        </div>
        {course.projects.length > 0 && <>
          <h3>Projects</h3>
          {course.projects.map((project) => <div className="project-block" key={project.projectDefinitionId}>
            <div className="row"><span>{project.title}</span><State value={project.verificationState} /></div>
            {canSubmit(project.verificationState) && <form
              action={submitProjectArtifactAction.bind(null, tenantId, project.projectDefinitionId)}
              className="submission-form"
            >
              <label htmlFor={`project-${project.projectDefinitionId}`}>Project artifact</label>
              <input
                id={`project-${project.projectDefinitionId}`}
                name="artifact"
                type="file"
                required
                accept=".json,.txt,.zip,application/json,text/plain,application/zip,application/octet-stream"
              />
              <p className="muted">Maximum 10 MB. The uploaded revision is sealed before submission and cannot be changed afterward.</p>
              <button type="submit">Upload, seal &amp; submit project</button>
            </form>}
            {(project.verificationState === "PENDING" || project.verificationState === "RUNNING") &&
              <p className="muted">Project verification is in progress. Infrastructure errors never count as learner failure.</p>}
          </div>)}
        </>}
      </section>)}
    </div>

    <h2>Verified evidence</h2>
    <div className="grid">
      {overview.evidence.length === 0 && <div className="card">No verified evidence yet.</div>}
      {overview.evidence.map((evidence) => <article className="card" key={evidence.evidenceId}>
        <h3>{evidence.skillName}</h3>
        <p className="muted">Issued from authoritative verification.</p>
        <State value="VERIFIED EVIDENCE" />
      </article>)}
    </div>

    <h2>Competency</h2>
    <div className="grid">
      {overview.competencies.length === 0 && <div className="card">No competency projection yet.</div>}
      {overview.competencies.map((item) => <article className="card" key={item.skillId}>
        <div className="row"><h3>{item.skillName}</h3><State value={item.status} /></div>
        <p>{item.evidenceCount} evidence record{item.evidenceCount === 1 ? "" : "s"}</p>
        {item.status === "NOT_YET_EVIDENCED" && <p className="muted">Not yet evidenced does not mean failed.</p>}
      </article>)}
    </div>

    <div className="notice" style={{ marginTop: 28 }}>A FAILED verification means that submission did not pass. SYSTEM ERROR means the verifier or infrastructure could not produce a learner result; it is not learner failure.</div>
  </main>;
}
