"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Folder, Inbox, Plus, Share2, Trash2, UsersRound } from "lucide-react";
import { type PersonalList, type PersonalTask } from "@/lib/personal-tasks";
import { PersonalDialog } from "./personal-task-dialogs";

type Person = { id: string; name: string | null; email: string };
type Manage = (path: string, method: "POST" | "PATCH" | "DELETE", changes?: Record<string, unknown>) => Promise<boolean>;

export default function PersonalLists({ lists, tasks, userId, pending, error: workspaceError, onOpen, onManage }: { lists: PersonalList[]; tasks: PersonalTask[]; userId: string; pending: boolean; error: string | null; onOpen: (listId: string) => void; onManage: Manage }) {
  const [dialog, setDialog] = useState<"new" | string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [members, setMembers] = useState<Person[]>([]);
  const [owner, setOwner] = useState<Person | null>(null);
  const [loading, setLoading] = useState(false);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const currentDialog = useRef(dialog);
  currentDialog.current = dialog;
  const list = lists.find(item => item.id === dialog);
  const canManage = list?.ownerId === userId;

  useEffect(() => {
    if (!dialog || dialog === "new") return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/todo-lists/${dialog}/members`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load list members.");
        if (!controller.signal.aborted) { setMembers(data.members); setOwner(data.owner); }
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load list members."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [dialog]);

  function open(value: string, listName = "") { setError(null); setConfirmDelete(false); setName(listName); setEmail(""); setMembers([]); setOwner(null); setDialog(value); }
  async function manage(path: string, method: "POST" | "PATCH" | "DELETE", changes?: Record<string, unknown>) {
    setError(null);
    const ok = await onManage(path, method, changes);
    if (ok) setDialog(null);
  }
  async function share(method: "POST" | "DELETE", memberEmail: string) {
    if (!list) return;
    const listId = list.id;
    setSharingBusy(true); setError(null);
    try {
      const response = await fetch(`/api/todo-lists/${listId}/members`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: memberEmail }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update sharing.");
      if (currentDialog.current === listId) { setMembers(current => method === "POST" ? [...current, data.member] : current.filter(person => person.email !== memberEmail)); setEmail(""); }
    } catch (failure) { if (currentDialog.current === listId) setError(failure instanceof Error ? failure.message : "Unable to update sharing."); }
    finally { setSharingBusy(false); }
  }

  return <>
    <div className="personal-list-toolbar"><p className="personal-muted">Organize tasks into lists and share selected lists with colleagues.</p><button type="button" className="accent-button workspace-standard-button" onClick={() => open("new")}><Plus size={16}/> New list</button></div>
    <div className="workspace-team-grid personal-lists-grid">{lists.map(item => {
      const own = item.ownerId === userId;
      const listTasks = tasks.filter(task => task.listId === item.id);
      const complete = listTasks.filter(task => task.isCompleted).length;
      const Icon = item.isInbox ? Inbox : own ? Folder : UsersRound;
      return <article className="workspace-surface personal-list-card" key={item.id}><div className="personal-list-title"><span><Icon size={20}/></span><div><h2>{item.name}</h2><p>{item.isInbox ? "Default list" : own ? "Your list" : "Shared with you"}</p></div><button type="button" title={own ? "Manage list" : "View list members"} aria-label={`Manage ${item.name}`} onClick={() => open(item.id, item.name)}><Share2 size={17}/></button></div><div className="personal-list-counts"><strong>{listTasks.length - complete}<span>open tasks</span></strong><strong>{complete}<span>completed</span></strong></div><button type="button" className="personal-list-open" onClick={() => onOpen(item.id)}>Open list <ArrowRight size={14}/></button></article>;
    })}</div>
    {dialog ? <PersonalDialog title={dialog === "new" ? "Create a list" : list?.name ?? "List details"} onClose={() => setDialog(null)}>
      {error || workspaceError ? <p role="alert" className="workspace-form-error">{error || workspaceError}</p> : null}
      {dialog === "new" || canManage && !list?.isInbox ? <form className="personal-list-name-form" onSubmit={event => { event.preventDefault(); void manage(dialog === "new" ? "/api/todo-lists" : `/api/todo-lists/${list!.id}`, dialog === "new" ? "POST" : "PATCH", { name }); }}><label className="workspace-field">List name<input required autoFocus maxLength={60} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Learning & development"/></label><button className="accent-button workspace-standard-button" disabled={pending || !name.trim()}>{dialog === "new" ? "Create list" : "Save name"}</button></form> : null}
      {list ? <section className="personal-list-sharing"><h3>People with access</h3>{loading ? <p className="personal-muted">Loading people…</p> : <>{owner ? <div className="personal-member"><div><strong>{owner.name || owner.email}</strong><span>{owner.email}</span></div><small>Owner</small></div> : null}{members.map(person => <div className="personal-member" key={person.id}><div><strong>{person.name || person.email}</strong><span>{person.email}</span></div>{canManage ? <button type="button" className="personal-delete-button" aria-label={`Remove ${person.email}`} disabled={sharingBusy} onClick={() => void share("DELETE", person.email)}>Remove</button> : <small>Member</small>}</div>)}</>}{canManage ? <form className="personal-share-form" onSubmit={event => { event.preventDefault(); void share("POST", email); }}><label className="workspace-field">Share with an ILAMED account<input required type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="colleague@example.com"/></label><button className="secondary-button workspace-standard-button" disabled={sharingBusy || loading || !email.trim()}><Share2 size={14}/> Share</button></form> : <p className="personal-muted">The list owner manages membership and list settings.</p>}</section> : null}
      {canManage && !list?.isInbox ? <div className="personal-danger-zone">{confirmDelete ? <><p>Delete this list and every task in it? This also removes access for its members.</p><div><button type="button" className="personal-delete-button" disabled={pending} onClick={() => void manage(`/api/todo-lists/${list!.id}`, "DELETE")}>Delete list</button><button type="button" className="secondary-button" onClick={() => setConfirmDelete(false)}>Keep list</button></div></> : <button type="button" className="personal-delete-button" onClick={() => setConfirmDelete(true)}><Trash2 size={14}/> Delete list</button>}</div> : null}
    </PersonalDialog> : null}
  </>;
}
