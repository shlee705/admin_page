import { escapeHtml as esc } from './store.js';

export async function initWorkspaceMenus(services) {
  if (!document.querySelector('.shell')) return;
  let disposed = false;
  window.addEventListener('adminator-account-changing',()=>{disposed=true;clearInterval(timer);},{once:true});
  async function refresh() {
    try {
      const [attention,rooms] = await Promise.all([services.client.request('/api/attention'),services.liveChat.list()]);
      if(disposed)return;
      for(const [label,items,href,count] of [
        ['Notifications',attention.items,'attention.html',attention.items.length],
        ['Messages',rooms.filter(r=>r.unread).map(r=>({title:r.name,detail:`${r.unread} unread messages`,href:`chat.html?room=${encodeURIComponent(r.id)}`})),'chat.html',rooms.reduce((n,r)=>n+r.unread,0)],
      ]) {
        const button=document.querySelector(`button[aria-label="${label}"]`); if(!button)continue; const menu=button.parentElement.querySelector('.dd-menu'); button.querySelector('.count').textContent=count; menu.querySelector('.dd-head').textContent=label==='Notifications'?'Needs attention':'Unread conversations'; menu.querySelector('.dd-list').innerHTML=items.slice(0,5).map(i=>`<a class="dd-item" href="${esc(i.href)}"><div class="dd-body"><div class="dd-text">${esc(i.title)}</div><div class="dd-preview">${esc(i.detail)}</div></div></a>`).join('')||'<p class="hub-panel">You are up to date.</p>'; menu.querySelector('.dd-footer').href=href; menu.querySelector('.dd-footer').textContent='View all →';
      }
    }catch{ if(!disposed) document.querySelectorAll('.dd-list').forEach(el=>{el.textContent='Unable to refresh. Reopen this page to retry.';}); }
  }
  let busy=false;
  const timer=setInterval(async()=>{if(disposed||busy||document.hidden)return;busy=true;try{await refresh();}finally{busy=false;}},30000);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});await refresh();
}
