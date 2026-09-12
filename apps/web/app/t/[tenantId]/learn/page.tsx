import { getLearnerOverview } from "@/lib/api";

function State({ value }: { value: string }) {
  return <span className="pill" data-state={value}>{value.replaceAll("_", " ")}</span>;
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
          {course.lessons.map((lesson) => <div key={lesson.lessonVersionId}>
            <div className="row"><strong>{lesson.title}</strong><State value={lesson.completionState ?? "NOT_STARTED"} /></div>
            {lesson.practices.map((practice) => <div className="row" key={practice.practiceRevisionId}>
              <span>Practice · {practice.key}{practice.attemptNumber ? ` · attempt ${practice.attemptNumber}` : ""}</span>
              <State value={practice.verificationState} />
            </div>)}
          </div>)}
        </div>
        {course.projects.length > 0 && <><h3>Projects</h3>{course.projects.map((project) => <div className="row" key={project.projectDefinitionId}>
          <span>{project.title}</span><State value={project.verificationState} />
        </div>)}</>}
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
