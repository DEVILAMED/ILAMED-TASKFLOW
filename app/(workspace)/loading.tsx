export default function WorkspaceLoading() {
  return <div className="workspace-view-loading" role="status" aria-live="polite" aria-label="Loading view">
    <span className="route-loading-spinner" aria-hidden="true" /><span>Loading view…</span>
  </div>;
}
