"use client";

import "./dashboard-guide.css";
import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from "react";
import { ArrowLeft, ArrowRight, Check, Compass, HelpCircle, X } from "lucide-react";
import { buildDashboardGuide, guideStorageKey, hasSeenGuide, placeGuideCard, rememberGuide, type GuideRect, type GuideStorage, type GuideWorkspace } from "@/lib/dashboard-guide";
import { getWorkspaceNavItems, type WorkspaceRole } from "@/lib/workspace-navigation";

const seenThisSession = new Set<string>();
function browserStorage(): GuideStorage | null { try { return window.localStorage; } catch { return null; } }
function visibleElement(selectors: string[]) {
  for (const selector of selectors) {
    const element = [...document.querySelectorAll<HTMLElement>(selector)].find(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
    if (element) return element;
  }
  return null;
}

export default function DashboardGuide({ account, role, workspace }: { account: string; role: WorkspaceRole; workspace: GuideWorkspace }) {
  const key = guideStorageKey(account, role, workspace);
  const steps = useMemo(() => buildDashboardGuide(role, workspace, getWorkspaceNavItems(role, workspace)), [role, workspace]);
  const [phase, setPhase] = useState<"welcome" | "tour" | null>(null);
  const [index, setIndex] = useState(0);
  const [anchor, setAnchor] = useState<GuideRect | null>(null);
  const [position, setPosition] = useState({ left: 16, top: 16 });
  const [targetFound, setTargetFound] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLElement>(null);
  const primaryAction = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const originalScroll = useRef({ x: 0, y: 0 });
  const sessionKey = useRef(key);
  const generatedId = useId().replaceAll(":", "");
  const titleId = `${generatedId}-title`, descriptionId = `${generatedId}-description`, maskId = `${generatedId}-mask`;
  const step = steps[index];
  const open = phase !== null;

  useEffect(() => {
    sessionKey.current = key;
    setPhase(null); setIndex(0); setAnchor(null);
    if (seenThisSession.has(key) || hasSeenGuide(browserStorage(), key)) return;
    const ready = () => {
      if (seenThisSession.has(key) || hasSeenGuide(browserStorage(), key)) return true;
      if (document.visibilityState === "hidden" || document.querySelector('dialog[open]')) return false;
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      originalScroll.current = { x: window.scrollX, y: window.scrollY };
      setPhase("welcome"); return true;
    };
    let interval: number | undefined;
    const timer = window.setTimeout(() => {
      if (!ready()) interval = window.setInterval(() => { if (ready()) window.clearInterval(interval); }, 500);
    }, 650);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); };
  }, [key]);

  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === key && hasSeenGuide(browserStorage(), key)) { seenThisSession.add(key); setPhase(null); } };
    window.addEventListener("storage", sync); return () => window.removeEventListener("storage", sync);
  }, [key]);

  useEffect(() => {
    const element = dialog.current;
    if (!open) { if (element?.open) element.close(); return; }
    if (!element?.open) element?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focus = window.requestAnimationFrame(() => primaryAction.current?.focus({ preventScroll: true }));
    return () => { window.cancelAnimationFrame(focus); document.body.style.overflow = previous; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const mobileMenu = document.querySelector<HTMLDetailsElement>('[data-guide="mobile-menu"]');
    const accountMenu = document.querySelector<HTMLDetailsElement>('[data-guide="account-menu"]');
    const opened: { element: HTMLDetailsElement; previous: boolean }[] = [];
    const reveal = (element: HTMLDetailsElement | null) => { if (!element) return; if (!opened.some(item => item.element === element)) opened.push({ element, previous: element.open }); element.open = true; };
    const revealMenus = () => {
      if (phase === "tour" && step?.reveal === "navigation" && window.matchMedia("(max-width: 1023px)").matches) reveal(mobileMenu);
      if (phase === "tour" && step?.reveal === "account") reveal(accountMenu);
    };
    revealMenus();
    const pageScroll = { x: window.scrollX, y: window.scrollY };
    let lastTarget: HTMLElement | null = null;
    let frame = 0;
    const measure = () => {
      revealMenus();
      const target = phase === "tour" && step ? visibleElement(step.selectors) : null;
      if (target && target !== lastTarget) { lastTarget = target; target.scrollIntoView({ behavior: "instant", block: "nearest", inline: "nearest" }); }
      const box = target?.getBoundingClientRect();
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      let nextAnchor: GuideRect | null = null;
      if (box && box.bottom > 0 && box.top < viewport.height) {
        const left = Math.max(6, box.left - 6), top = Math.max(6, box.top - 6);
        nextAnchor = { left, top, width: Math.max(0, Math.min(viewport.width - 6, box.right + 6) - left), height: Math.max(0, Math.min(viewport.height - 6, box.bottom + 6) - top) };
      }
      setAnchor(current => JSON.stringify(current) === JSON.stringify(nextAnchor) ? current : nextAnchor);
      setTargetFound(Boolean(target));
      const size = card.current?.getBoundingClientRect();
      const nextPosition = placeGuideCard(nextAnchor, viewport, { width: size?.width ?? 380, height: size?.height ?? 300 });
      setPosition(current => current.left === nextPosition.left && current.top === nextPosition.top ? current : nextPosition);
    };
    const schedule = () => { window.cancelAnimationFrame(frame); frame = window.requestAnimationFrame(measure); };
    const observer = new MutationObserver(schedule);
    const page = document.querySelector('[data-guide="page"]');
    if (page) observer.observe(page, { childList: true, subtree: true });
    const resize = new ResizeObserver(schedule);
    if (card.current) resize.observe(card.current);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    const poll = window.setInterval(schedule, 350);
    schedule();
    primaryAction.current?.focus({ preventScroll: true });
    return () => {
      observer.disconnect(); resize.disconnect(); window.cancelAnimationFrame(frame); window.clearInterval(poll);
      window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true);
      for (const { element, previous } of opened) element.open = previous;
      window.scrollTo({ left: pageScroll.x, top: pageScroll.y, behavior: "instant" });
    };
  }, [open, phase, step]);

  function stop(status: "completed" | "skipped") {
    seenThisSession.add(sessionKey.current); rememberGuide(browserStorage(), sessionKey.current, status);
    setPhase(null);
    window.requestAnimationFrame(() => {
      window.scrollTo({ left: originalScroll.current.x, top: originalScroll.current.y, behavior: "instant" });
      if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true });
    });
  }
  function replay(event: MouseEvent<HTMLButtonElement>) {
    if (document.querySelector('dialog[open]')) return;
    previousFocus.current = event.currentTarget;
    originalScroll.current = { x: window.scrollX, y: window.scrollY };
    setIndex(0); setPhase("welcome");
  }
  function next() { if (index === steps.length - 1) stop("completed"); else setIndex(current => current + 1); }

  return <>
    <button type="button" data-guide="replay" className="workspace-guide-launch workspace-control" title="Dashboard guide" aria-label="Start dashboard guide" aria-haspopup="dialog" onClick={replay}><HelpCircle size={18} strokeWidth={1.7}/><span className="sr-only">Dashboard guide</span></button>
    <dialog ref={dialog} className="dashboard-guide-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event => { event.preventDefault(); stop("skipped"); }} onKeyDown={event => {
      if (event.key === "Tab" && !event.ctrlKey && !event.metaKey) {
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')].filter(element => element.getClientRects().length > 0);
        const focused = controls.indexOf(document.activeElement as HTMLElement);
        if (controls.length && (event.shiftKey && focused <= 0 || !event.shiftKey && (focused < 0 || focused === controls.length - 1))) {
          event.preventDefault(); (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
        }
        return;
      }
      if (phase !== "tour") return;
      if (event.key === "ArrowRight") { event.preventDefault(); next(); }
      if (event.key === "ArrowLeft" && index > 0) { event.preventDefault(); setIndex(current => current - 1); }
    }}>
      {open ? <>
        <svg className="dashboard-guide-shade" width="100%" height="100%" aria-hidden="true"><defs><mask id={maskId}><rect width="100%" height="100%" fill="white"/>{phase === "tour" && anchor ? <rect x={anchor.left} y={anchor.top} width={anchor.width} height={anchor.height} rx="10" fill="black"/> : null}</mask></defs><rect width="100%" height="100%" fill="rgb(10 17 33 / 60%)" mask={`url(#${maskId})`}/></svg>
        {phase === "tour" && anchor ? <div className="dashboard-guide-spotlight" aria-hidden="true" style={{ left: anchor.left, top: anchor.top, width: anchor.width, height: anchor.height }}/> : null}
        <section ref={card} className={`dashboard-guide-card ${phase === "welcome" ? "is-welcome" : ""}`} data-guide-step={phase === "welcome" ? "welcome" : step?.id} data-guide-target-found={targetFound} style={{ left: position.left, top: position.top }}>
          <div className="dashboard-guide-card-top"><span className="dashboard-guide-label"><Compass size={14}/>{phase === "welcome" ? "A QUICK INTRODUCTION" : `${index + 1} OF ${steps.length}`}</span><button type="button" className="dashboard-guide-close" aria-label="Skip dashboard guide" onClick={() => stop("skipped")}><X size={18}/></button></div>
          {phase === "welcome" ? <>
            <div className="dashboard-guide-welcome-icon"><Compass size={30} strokeWidth={1.5}/></div>
            <h2 id={titleId}>Welcome to your workspace</h2><p id={descriptionId}>Take a short tour of {workspace === "personal" ? "your personal tasks and work reports" : "your dashboard and company tasks"}. We’ll show you where to find the things you use every day.</p>
            <ul className="dashboard-guide-welcome-list"><li><Check size={14}/> Find and manage your tasks</li><li><Check size={14}/> {workspace === "personal" ? "Save daily and monthly work reports" : role === "USER" ? "Track submissions and manager feedback" : "Follow team progress and review work"}</li><li><Check size={14}/> Switch between your workspaces</li></ul>
            <p className="dashboard-guide-duration">About a minute · Skip whenever you like</p>
            <div className="dashboard-guide-actions"><button type="button" className="dashboard-guide-skip" onClick={() => stop("skipped")}>Skip for now</button><button ref={primaryAction} type="button" className="accent-button" onClick={() => { setIndex(0); setPhase("tour"); }}>Show me around <ArrowRight size={15}/></button></div>
          </> : <>
            <div className="dashboard-guide-progress" aria-hidden="true">{steps.map((item, position) => <span key={item.id} className={position <= index ? "is-past" : ""}/>)}</div>
            <div aria-live="polite" aria-atomic="true"><h2 id={titleId}>{step?.title}</h2><p id={descriptionId}>{step?.description}</p></div>
            <div className="dashboard-guide-actions"><button type="button" className="dashboard-guide-back" disabled={index === 0} onClick={() => setIndex(current => current - 1)}><ArrowLeft size={14}/> Back</button><button ref={primaryAction} type="button" className="accent-button" onClick={next}>{index === steps.length - 1 ? "Finish" : "Next"}{index === steps.length - 1 ? <Check size={15}/> : <ArrowRight size={15}/>}</button></div>
            <button type="button" className="dashboard-guide-skip dashboard-guide-skip-bottom" onClick={() => stop("skipped")}>Skip guide</button>
          </>}
        </section>
      </> : null}
    </dialog>
  </>;
}
