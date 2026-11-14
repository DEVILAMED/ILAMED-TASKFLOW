export function CompanyContext() {
  return (
    <div className="mt-4 border-t border-white/[0.08] pt-4">
      <p className="text-sm leading-6 text-white/55">
        ILAMED (Institute of Laser &amp; Aesthetic Medicine Training) provides hands-on clinical
        training in aesthetic medicine and surgery, cosmetology, cosmetic gynecology, aesthetic
        dentistry, and regenerative medicine.
      </p>
      <a
        href="https://www.ilamed.org/"
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] transition hover:text-white"
      >
        Visit the official ILAMED website
        <span aria-hidden="true">↗</span>
      </a>
    </div>
  );
}
