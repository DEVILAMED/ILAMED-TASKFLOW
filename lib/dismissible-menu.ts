const menuOpenedEvent = "workspace:menu-opened";

export function announceMenuOpened(container: HTMLElement) {
  container.dispatchEvent(new Event(menuOpenedEvent, { bubbles: true }));
}

export function installMenuDismissal({ container, trigger, isOpen, close }: {
  container: HTMLElement;
  trigger: HTMLElement | null;
  isOpen: () => boolean;
  close: () => void;
}) {
  const document = container.ownerDocument;
  function outside(event: PointerEvent) {
    if (isOpen() && event.target instanceof Node && !container.contains(event.target)) close();
  }
  function escape(event: KeyboardEvent) {
    if (event.key !== "Escape" || event.defaultPrevented || !isOpen() || document.querySelector("dialog[open]")) return;
    event.preventDefault();
    close();
    trigger?.focus({ preventScroll: true });
  }
  function otherMenu(event: Event) {
    if (event.target !== container && isOpen()) close();
  }
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("keydown", escape);
  document.addEventListener(menuOpenedEvent, otherMenu);
  return () => {
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", escape);
    document.removeEventListener(menuOpenedEvent, otherMenu);
  };
}
