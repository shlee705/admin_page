import { escapeHtml } from './workspace/store.js';

/** Template galleries remain explicit examples; useful exports operate on visible content. */
export function initTemplatePages() {
  const kind = document.body.dataset.active;
  if (!['charts','forms','buttons','ui','basic-table','datatable','google-maps','vector-maps','blank'].includes(kind)) return;
  const main = document.querySelector('main'); const notice = document.createElement('p'); notice.className = 'workspace-sample'; notice.dataset.testid = 'template-mode'; notice.textContent = 'Template example · Sample data and controls. These examples do not manage real account roles, profiles, sales or locations.'; main.querySelector('.hero').after(notice);
  function download(name, blob) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
  function csv(table) { return [...table.querySelectorAll('tr')].filter(row => !row.hidden).map(row => [...row.querySelectorAll('th,td')].map(cell => `"${cell.innerText.trim().replaceAll('"','""')}"`).join(',')).join('\r\n'); }
  if (['basic-table','datatable'].includes(kind)) {
    const table = main.querySelector('table');
    main.querySelector('.hero-actions button').onclick = () => download(`${kind}-samples.csv`,new Blob([csv(table)],{type:'text/csv;charset=utf-8'}));
    if (kind === 'datatable') {
      const search = main.querySelector('input[type="search"]'); search.dataset.testid = 'table-search'; search.oninput = () => { table.querySelectorAll('tbody tr').forEach(row => { row.hidden = !row.innerText.toLowerCase().includes(search.value.toLowerCase()); }); notice.textContent = `Template sample · ${[...table.querySelectorAll('tbody tr')].filter(row => !row.hidden).length} matching rows. Export downloads these visible samples.`; };
      main.querySelectorAll('.data-cell-actions button').forEach(button => { if (button.getAttribute('aria-label') === 'View') button.onclick = () => { const dialog = document.createElement('dialog'); dialog.className = 'workspace-dialog'; dialog.innerHTML = `<h2>Sample row</h2><p>${escapeHtml(button.closest('tr').innerText)}</p><p>Template fixture, not a registered account.</p><button class="btn">Close</button>`; document.body.append(dialog); dialog.querySelector('button').onclick = () => { dialog.close(); dialog.remove(); }; dialog.oncancel = () => dialog.remove(); dialog.showModal(); }; });
    }
  }
  if (kind === 'charts') main.querySelector('.hero-actions button').onclick = () => { const canvas = main.querySelector('canvas'); if (canvas) { const link = document.createElement('a'); link.href = canvas.toDataURL('image/png'); link.download = 'chart-sample.png'; link.click(); } };
  if (kind === 'vector-maps') main.querySelector('.hero-actions button').onclick = () => { const svg = main.querySelector('[data-vmap] svg'); if (svg) download('map-sample.svg',new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'})); else notice.textContent = 'Map is still loading. Retry export.'; };
  if (kind === 'forms') {
    const form = main.querySelector('form'); form.removeAttribute('onsubmit');
    const submit = () => { if(form.reportValidity()) notice.textContent = 'Demo form validated. No account profile or role changes were saved.'; };
    form.onsubmit = event => { event.preventDefault(); submit(); };
    main.querySelectorAll('button').forEach(button => { if(button.textContent.trim()==='Save changes') button.onclick=submit; if(button.textContent.trim()==='Cancel') button.onclick=()=>{ form.reset(); notice.textContent='Demo form reset.'; }; });
  }
}
