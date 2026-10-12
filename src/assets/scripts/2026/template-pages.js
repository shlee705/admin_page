/** Template galleries remain explicit examples; useful exports operate on visible content. */
export function initTemplatePages() {
  const kind = document.body.dataset.active;
  // Business aliases are handled by the entry point/service hub. The old table,
  // Forms and Charts sample handlers cannot be reached by a shipped page.
  if (!['buttons','ui','google-maps','vector-maps'].includes(kind)) return;
  const main = document.querySelector('main'); const notice = document.createElement('p'); notice.className = 'workspace-sample'; notice.dataset.testid = 'template-mode'; notice.textContent = 'Template example · Sample data and controls. These examples do not manage real account roles, profiles, sales or locations.'; main.querySelector('.hero').after(notice);
  if (kind === 'ui') {
    const clampPopovers = () => main.querySelectorAll('.popover-demo .pop').forEach(pop => {
      pop.style.removeProperty('translate'); pop.style.removeProperty('--popover-pointer-left');
      if (window.innerWidth > 720) return;
      const bounds = pop.getBoundingClientRect();
      const shift = bounds.left < 16 ? 16 - bounds.left : bounds.right > window.innerWidth - 16 ? window.innerWidth - 16 - bounds.right : 0;
      pop.style.translate = `${shift}px`;
      pop.style.setProperty('--popover-pointer-left', `${Math.max(10, Math.min(bounds.width - 10, bounds.width / 2 - shift))}px`);
    });
    clampPopovers(); window.addEventListener('resize', clampPopovers);
    window.addEventListener('pagehide', () => window.removeEventListener('resize', clampPopovers), { once: true });
    window.addEventListener('pageshow', event => { if (event.persisted) { clampPopovers(); window.addEventListener('resize', clampPopovers); } });
  }
  function download(name, blob) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
  if (kind === 'vector-maps') main.querySelector('.hero-actions button').onclick = () => { const svg = main.querySelector('[data-vmap] svg'); if (svg) download('map-sample.svg',new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'})); else notice.textContent = 'Map is still loading. Retry export.'; };
}
