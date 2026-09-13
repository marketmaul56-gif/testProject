export type CohortStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
export type MembershipStatus = "ENROLLED" | "REMOVED";

const allowedCohortTransitions: Readonly<Record<CohortStatus, readonly CohortStatus[]>> = {
  DRAFT: ["ACTIVE", "ARCHIVED"],
  ACTIVE: ["COMPLETED"],
  COMPLETED: ["ARCHIVED"],
  ARCHIVED: [],
};

export function transitionCohort(from: CohortStatus, to: CohortStatus): CohortStatus {
  if (!allowedCohortTransitions[from].includes(to)) {
    throw new Error(`invalid cohort lifecycle transition: ${from} -> ${to}`);
  }
  return to;
}

export function removeMembership(status: MembershipStatus): MembershipStatus {
  if (status !== "ENROLLED") throw new Error("only an enrolled membership may be removed");
  return "REMOVED";
}
