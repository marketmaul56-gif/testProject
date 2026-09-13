import { revalidatePath } from "next/cache";
import { getInstructorLearner, postGuidance } from "@/lib/api";

function State({ value }: { value: string }) {
  return <span className="pill" data-state={value}>{value.replaceAll("_", " ")}</span>;
}

export default async function LearnerDetailPage({ params }: { params: Promise<{ tenantId: string; cohortId: string; learnerId: string }> }) {
  const { tenantId, cohortId, learnerId } = await params;
  const detail = await getInstructorLearner(tenantId, cohortId, learnerId);
  const pagePath = `/t/${tenantId}/instructor/cohorts/${cohortId}/learners/${learnerId}`;

  async function addGuidance(formData: FormData) {
    "use server";
    const message = String(formData.get("message") ?? "");
    await postGuidance(tenantId, cohortId, learnerId, message);
    revalidatePath(pagePath);
  }

  return <main>
    <h1>{detail.displayName ?? "Learner"}</h1>
    <p className="muted">Operational progress: {detail.completedLessons}/{detail.totalLessons} lessons completed.</p>

    <h2>Evidence-backed competency</h2>
    <div className="grid">
      {detail.competencies.map((item) => <article className="card" key={item.skillId}>
        <div className="row"><h3>{item.skillName}</h3><State value={item.status} /></div>
        <p>{item.evidenceCount} verified evidence record{item.evidenceCount === 1 ? "" : "s"}</p>
        {item.status === "NOT_YET_EVIDENCED" && <p className="muted">Not yet evidenced is not a learner failure.</p>}
      </article>)}
      {detail.competencies.length === 0 && <div className="card">No competency projection yet.</div>}
    </div>

    <h2>Evidence</h2>
    <div className="stack">{detail.evidence.map((item) => <div className="card row" key={item.evidenceId}><span>{item.skillName}</span><State value="VERIFIED EVIDENCE" /></div>)}{detail.evidence.length === 0 && <div className="card">No verified evidence yet.</div>}</div>

    <h2>Formative guidance</h2>
    <form action={addGuidance} className="card">
      <label htmlFor="message"><strong>Guidance for the learner</strong></label>
      <textarea id="message" name="message" minLength={1} maxLength={2000} required placeholder="Give feedback, a hint, or a next-step question. Do not assign competence." />
      <button type="submit">Add guidance</button>
      <span className="muted">Guidance cannot change verification, evidence, or competency.</span>
    </form>
    <div className="stack" style={{ marginTop: 16 }}>{detail.guidance.map((item) => <article className="card" key={item.guidanceId}><p>{item.message}</p><small className="muted">{new Date(item.createdAt).toLocaleString()}</small></article>)}</div>
  </main>;
}
