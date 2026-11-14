import type { ReactNode } from "react";

export default function WorkspacePageHeading({ kicker, title, description, action }: { kicker: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="workspace-page-heading"><div><p className="workspace-page-kicker">{kicker}</p><h1>{title}</h1>{description ? <p className="workspace-page-description">{description}</p> : null}</div>{action}</header>;
}
