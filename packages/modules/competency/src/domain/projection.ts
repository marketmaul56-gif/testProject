import type { SkillEvidence } from "./evidence.ts";

export type CompetencyState = "NOT_YET_EVIDENCED" | "EVIDENCED";

export function projectCompetency(skillId: string, evidence: readonly SkillEvidence[]): CompetencyState {
  return evidence.some((item) => item.skillId === skillId) ? "EVIDENCED" : "NOT_YET_EVIDENCED";
}
