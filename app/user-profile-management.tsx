"use client";

import { useRouter } from "next/navigation";
import UserRoleControl from "@/app/(workspace)/admin/user-role-control";
import EmployeeAccountEditor from "@/app/(workspace)/admin/employee-account-editor";
import EmployeeProfileEditor, { type EmployeeProfile, type ManagerOption } from "@/app/(workspace)/admin/employee-profile-editor";
import EmployeeLeaveEditor from "@/app/(workspace)/admin/employee-leave-editor";
import EmployeeDepartmentControl from "@/app/employee-department-control";
import ProfilePhotoUploader from "@/app/profile-photo-uploader";

type Account = {
  id: string; name: string | null; email: string; role: "ADMIN" | "MANAGER" | "USER";
  isBlocked: boolean; avatarUrl: string | null; profile: EmployeeProfile | null;
};

export default function UserProfileManagement({ account, currentUserId, departments, managers, leaveDays, today }: {
  account: Account; currentUserId: string; departments: { id: string; name: string }[];
  managers: ManagerOption[]; leaveDays: readonly string[]; today: string;
}) {
  const router = useRouter();
  const isCurrentUser = account.id === currentUserId;
  return <section className="workspace-surface" aria-labelledby="profile-management-heading">
    <h2 id="profile-management-heading">Manage account</h2>
    <p className="mt-1 text-xs text-[var(--muted)]">Account settings for {account.name || account.email}. Administrator access only.</p>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-xl border border-[var(--stroke)] p-4" aria-label="Role and login access">
        <h3 className="text-sm font-semibold">Role and login access</h3>
        <UserRoleControl userId={account.id} role={account.role} isBlocked={account.isBlocked} displayName={account.name || account.email} isCurrentUser={isCurrentUser} onDeletedHref="/admin/employees" />
        {account.role !== "ADMIN" ? <EmployeeAccountEditor account={account} onSaved={() => router.refresh()} /> : null}
      </section>
      {account.role !== "ADMIN" || isCurrentUser ? <section className="rounded-xl border border-[var(--stroke)] p-4" aria-label="Profile picture settings"><h3 className="mb-3 text-sm font-semibold">Profile picture</h3><ProfilePhotoUploader userId={account.id} name={account.name || account.email} avatarUrl={account.avatarUrl} /></section> : null}
    </div>
    {account.role !== "ADMIN" ? <div className="mt-4 space-y-4">
      <section className="rounded-xl border border-[var(--stroke)] p-4" aria-label="Employment settings"><h3 className="mb-3 text-sm font-semibold">Employment details</h3>
        <EmployeeDepartmentControl employeeId={account.id} employeeName={account.name || account.email} departmentId={account.profile?.departmentId ?? null} departments={departments} />
        <div className="mt-3"><EmployeeProfileEditor key={JSON.stringify(account.profile)} employeeId={account.id} profile={account.profile} managers={managers} onSaved={() => router.refresh()} /></div>
      </section>
      <EmployeeLeaveEditor employeeId={account.id} leaveDays={leaveDays} today={today} />
    </div> : null}
  </section>;
}
