import { prisma } from "@/lib/prisma";

import { COMPANY_TASK_PROJECT_ID } from "@/lib/company-task-constants";
export { COMPANY_TASK_PROJECT_ID };

export async function ensureCompanyTaskProject(ownerId: string) {
  return prisma.project.upsert({
    where: { id: COMPANY_TASK_PROJECT_ID },
    create: {
      id: COMPANY_TASK_PROJECT_ID,
      title: "Company Tasks",
      description: "Shared company task assignment and tracking.",
      ownerId,
    },
    update: {},
    select: { id: true },
  });
}
