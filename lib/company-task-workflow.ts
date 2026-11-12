export function canChangeCompanyTaskStatus(role: string, managesTask: boolean, current: string, next: string) {
  if (role === "ADMIN" || (role === "MANAGER" && managesTask)) {
    if (next === "IN_PROGRESS") return current === "ON_HOLD";
    if (next === "ON_HOLD") return ["TODO", "ACCEPTED", "IN_PROGRESS", "REVISION_REQUESTED"].includes(current);
    return role === "ADMIN" && next === "CANCELLED" && !["APPROVED", "CANCELLED"].includes(current);
  }
  const transitions: Record<string, string[]> = {
    TODO: ["ACCEPTED", "IN_PROGRESS"],
    ACCEPTED: ["IN_PROGRESS"],
    IN_PROGRESS: ["SUBMITTED_FOR_REVIEW"],
    REVISION_REQUESTED: ["IN_PROGRESS", "SUBMITTED_FOR_REVIEW"],
  };
  return transitions[current]?.includes(next) === true;
}
