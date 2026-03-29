const API = '';
let adminToken = sessionStorage.getItem('instatp_token') || '';
let allKeys = [];
let allHwidKeys = [];
let modalCallback = null;

window.addEventListener('DOMContentLoaded', () => {
  if (adminToken) showDashboard();
  renderApiDocs();
});

async function doLogin() {
  const password = document.getElementById('login-password').value;
  const err = document.getElementById('login-error');
  try {
    const res = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (data.success) {
      adminToken = password;
      sessionStorage.setItem('instatp_token', password);
      showDashboard();
    } else {
      err.textContent = 'Contraseña incorrecta'; err.style.display = 'block';
    }
  } catch {
    err.textContent = 'Error de conexión'; err.style.display = 'block';
  }
}

function showDashboard() {
  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('dashboard-screen').classList.add('active');
  loadKeys();
}

function authHeaders() {
  return { 'Content-Type': 'application/json', 'x-admin-token': adminToken };
}

function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`tab-${name}`).classList.add('active');
  document.querySelectorAll('.nav-item')[['keys','create','hwid','api'].indexOf(name)]?.classList.add('active');
  if (name === 'keys') loadKeys();
  if (name === 'hwid') loadHwid();
}

function formatDuration(k) {
  if (k.duration_val && k.duration_unit) {
    const labels = { minutes: 'min', hours: 'h', days: 'día', years: 'año' };
    const label = labels[k.duration_unit] || 'día';
    const plural = k.duration_val !== 1 && k.duration_unit !== 'minutes' ? 's' : '';
    return `${k.duration_val} ${label}${plural}`;
  }
  return `${k.duration_days} día${k.duration_days !== 1 ? 's' : ''}`;
}

async function loadKeys() {
  try {
    const res = await fetch(`${API}/api/admin/keys`, { headers: authHeaders() });
    if (res.status === 401) { sessionStorage.removeItem('instatp_token'); location.reload(); return; }
    const data = await res.json();
    allKeys = data.keys || [];
    renderKeys(allKeys);
    updateStats(allKeys);
  } catch { toast('Error al cargar keys', 'error'); }
}

function renderKeys(keys) {
  const tbody = document.getElementById('keys-tbody');
  const empty = document.getElementById('empty-state');
  if (!keys.length) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  tbody.innerHTML = keys.map(k => {
    const expDate = new Date(k.expires_at * 1000).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' });
    const badge = k.status === 'expired'
      ? `<span class="badge badge-expired">Expirada</span>`
      : `<span class="badge badge-active">Activa</span>`;
    return `
      <tr>
        <td><div class="key-cell" onclick="copyText('${k.key}')" title="Copiar">${k.key}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></div></td>
        <td style="font-weight:500">${k.owner || '<span style="opacity:0.4">—</span>'}</td>
        <td>${badge}</td>
        <td>${formatDuration(k)}</td>
        <td>${expDate}</td>
        <td><div class="hwid-cell" title="${k.hwid || 'Sin HWID'}">${k.hwid ? k.hwid : '<span style="opacity:0.4">—</span>'}</div></td>
        <td><div class="actions">
          ${k.hwid ? `<button class="btn-icon" onclick="resetHwid('${k.key}')" title="Resetear HWID"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></svg></button>` : ''}
          <button class="btn-icon danger" onclick="deleteKey('${k.key}')" title="Eliminar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
        </div></td>
      </tr>`;
  }).join('');
}

function updateStats(keys) {
  document.getElementById('stat-total').textContent = keys.length;
  document.getElementById('stat-active').textContent = keys.filter(k => k.status === 'active').length;
  document.getElementById('stat-expired').textContent = keys.filter(k => k.status === 'expired').length;
}

function filterKeys() {
  const q = document.getElementById('search-input').value.toLowerCase();
  renderKeys(allKeys.filter(k =>
    k.key.toLowerCase().includes(q) || (k.owner||'').toLowerCase().includes(q) || (k.hwid||'').toLowerCase().includes(q)
  ));
}

function setDuration(val, unit) {
  document.getElementById('create-duration').value = val;
  document.getElementById('create-unit').value = unit;
}

function toSeconds(val, unit) {
  const map = { minutes: 60, hours: 3600, days: 86400, years: 31536000 };
  return val * (map[unit] || 86400);
}

async function createKey() {
  const owner = document.getElementById('create-owner').value.trim();
  const val = parseInt(document.getElementById('create-duration').value);
  const unit = document.getElementById('create-unit').value;
  if (!owner) { toast('Ingresa el nombre del usuario', 'error'); return; }
  if (!val || val < 1) { toast('Ingresa una duración válida', 'error'); return; }
  const duration_days = +(toSeconds(val, unit) / 86400).toFixed(4);
  try {
    const res = await fetch(`${API}/api/admin/keys`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ duration_days, duration_val: val, duration_unit: unit, owner })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('result-key-text').textContent = data.key;
      document.getElementById('create-result').classList.remove('hidden');
      document.getElementById('create-owner').value = '';
      document.getElementById('create-duration').value = '';
      toast('Key creada correctamente', 'success');
      loadKeys();
    } else { toast(data.message || 'Error al crear key', 'error'); }
  } catch { toast('Error de conexión', 'error'); }
}

function copyKey() { copyText(document.getElementById('result-key-text').textContent); }

function resetHwid(key) {
  openModal('Resetear HWID', `¿Resetear el HWID de la key <strong>${key}</strong>?`, async () => {
    try {
      await fetch(`${API}/api/admin/keys/${key}/reset-hwid`, { method: 'PATCH', headers: authHeaders() });
      toast('HWID reseteado', 'success'); loadKeys();
    } catch { toast('Error de conexión', 'error'); }
  });
}

function deleteKey(key) {
  openModal('Eliminar Key', `¿Eliminar permanentemente la key <strong>${key}</strong>?`, async () => {
    try {
      await fetch(`${API}/api/admin/keys/${key}`, { method: 'DELETE', headers: authHeaders() });
      toast('Key eliminada', 'success'); loadKeys();
    } catch { toast('Error de conexión', 'error'); }
  });
}

function now() { return Math.floor(Date.now() / 1000); }

async function loadHwid() {
  try {
    const res = await fetch(`${API}/api/admin/keys`, { headers: authHeaders() });
    const data = await res.json();
    allHwidKeys = data.keys || [];
    renderHwid(allHwidKeys);
  } catch { toast('Error al cargar HWID', 'error'); }
}

function filterHwid() {
  const q = document.getElementById('hwid-search').value.toLowerCase();
  renderHwid(allHwidKeys.filter(k =>
    k.key.toLowerCase().includes(q) || (k.owner||'').toLowerCase().includes(q) || (k.hwid||'').toLowerCase().includes(q)
  ));
}

function renderHwid(keys) {
  const container = document.getElementById('hwid-cards');
  const empty = document.getElementById('hwid-empty');
  if (!keys.length) { container.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  container.innerHTML = keys.map(k => {
    const linked = !!k.hwid;
    const remaining = k.expires_at - now();
    const days = Math.floor(remaining / 86400);
    const hours = Math.floor((remaining % 86400) / 3600);
    let expiryText, expiryClass;
    if (k.status === 'expired') { expiryText = 'Expirada'; expiryClass = 'expired'; }
    else if (days < 3) { expiryText = days > 0 ? `Expira en ${days}d ${hours}h` : `Expira en ${hours}h`; expiryClass = 'expiring'; }
    else { expiryText = `Expira en ${days} días`; expiryClass = ''; }
    return `
      <div class="hwid-card ${linked ? 'linked' : 'unlinked'}">
        <div class="hwid-card-header">
          <div>
            <div class="hwid-card-user">${k.owner || 'Sin usuario'}</div>
            <div class="hwid-card-key" onclick="copyText('${k.key}')" title="Copiar key">${k.key}</div>
          </div>
          ${linked ? `<span class="badge badge-active">Vinculado</span>` : `<span class="badge badge-expired" style="background:rgba(100,116,139,0.12);color:var(--text3);border-color:rgba(100,116,139,0.2)">Sin vincular</span>`}
        </div>
        <div class="hwid-status ${linked ? 'linked' : 'unlinked'}">
          <div class="hwid-status-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></div>
          <div>
            <div class="hwid-status-label">${linked ? 'Dispositivo vinculado' : 'Sin dispositivo'}</div>
            <div class="hwid-status-value ${linked ? '' : 'no-device'}">${linked ? k.hwid : 'Ningún dispositivo vinculado aún'}</div>
          </div>
        </div>
        <div class="hwid-card-footer">
          <div class="hwid-expiry ${expiryClass}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${expiryText}
          </div>
          <button class="btn-unlink" onclick="unlinkHwid('${k.key}')" ${!linked ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            Desvincular
          </button>
        </div>
      </div>`;
  }).join('');
}

function unlinkHwid(key) {
  openModal('Desvincular dispositivo', `¿Desvincular el dispositivo de la key <strong>${key}</strong>?<br><br>El usuario podrá vincularla desde otro dispositivo.`, async () => {
    try {
      await fetch(`${API}/api/admin/keys/${key}/reset-hwid`, { method: 'PATCH', headers: authHeaders() });
      toast('Dispositivo desvinculado', 'success'); loadHwid();
    } catch { toast('Error de conexión', 'error'); }
  });
}

function renderApiDocs() {
  const base = window.location.origin;
  const endpoints = [
    { method:'GET', path:'/api/validate/:key', desc:'Validar una key',
      body:`local res = HttpService:GetAsync("${base}/api/validate/TU-KEY")\nlocal data = HttpService:JSONDecode(res)\nif data.valid then print("OK") else print(data.reason) end`,
      response:`{ "valid": true, "key": "XXXX-XXXX-XXXX-XXXX", "expires_at": 1700000000 }` },
    { method:'POST', path:'/api/hwid', desc:'Registrar / verificar HWID',
      body:`local body = HttpService:JSONEncode({ key = "TU-KEY", hwid = tostring(player.UserId) })\nlocal res = HttpService:PostAsync("${base}/api/hwid", body, Enum.HttpContentType.ApplicationJson)\nlocal data = HttpService:JSONDecode(res)\nprint(data.success, data.message or data.reason)`,
      response:`{ "success": true, "message": "HWID registered" }` },
    { method:'GET', path:'/api/expiry/:key', desc:'Verificar expiración',
      body:`local res = HttpService:GetAsync("${base}/api/expiry/TU-KEY")\nlocal data = HttpService:JSONDecode(res)\nprint("Segundos restantes:", data.remaining_seconds)`,
      response:`{ "found": true, "remaining_seconds": 86400, "expired": false }` }
  ];
  const mc = { GET:'method-get', POST:'method-post' };
  document.getElementById('api-docs-content').innerHTML = endpoints.map((ep, i) => `
    <div class="api-endpoint">
      <div class="api-endpoint-header" onclick="toggleApiBody(${i})">
        <span class="method-badge ${mc[ep.method]}">${ep.method}</span>
        <span class="api-path">${ep.path}</span>
        <span class="api-desc">${ep.desc}</span>
      </div>
      <div class="api-body hidden" id="api-body-${i}">
        <p>Ejemplo Roblox Lua:</p><pre>${ep.body}</pre>
        <p style="margin-top:1rem">Respuesta:</p><pre>${ep.response}</pre>
      </div>
    </div>`).join('');
}

function toggleApiBody(i) { document.getElementById(`api-body-${i}`).classList.toggle('hidden'); }

function openModal(title, body, onConfirm) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('modal-overlay').classList.remove('hidden');
  modalCallback = onConfirm;
}
function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); modalCallback = null; }
document.getElementById('modal-confirm-btn').addEventListener('click', () => { if (modalCallback) modalCallback(); closeModal(); });
document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target === document.getElementById('modal-overlay')) closeModal(); });

function copyText(text) { navigator.clipboard.writeText(text).then(() => toast('Copiado', 'success')); }

function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast ${type}`; el.classList.remove('hidden');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.add('hidden'), 3000);
}

(function() {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];
  function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  function rand(a,b) { return Math.random()*(b-a)+a; }
  function mkp() { return { x:rand(0,W), y:rand(0,H), vx:rand(-0.15,0.15), vy:rand(-0.15,0.15), r:rand(1,2.5), alpha:rand(0.1,0.5), color:Math.random()>0.5?'139,92,246':'6,182,212' }; }
  resize(); for(let i=0;i<80;i++) particles.push(mkp());
  window.addEventListener('resize', resize);
  function draw() {
    ctx.clearRect(0,0,W,H);
    particles.forEach(p => {
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0)p.x=W; if(p.x>W)p.x=0; if(p.y<0)p.y=H; if(p.y>H)p.y=0;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle=`rgba(${p.color},${p.alpha})`; ctx.fill();
    });
    for(let i=0;i<particles.length;i++) for(let j=i+1;j<particles.length;j++) {
      const dx=particles[i].x-particles[j].x, dy=particles[i].y-particles[j].y;
      const d=Math.sqrt(dx*dx+dy*dy);
      if(d<100){ ctx.beginPath(); ctx.moveTo(particles[i].x,particles[i].y); ctx.lineTo(particles[j].x,particles[j].y); ctx.strokeStyle=`rgba(139,92,246,${0.08*(1-d/100)})`; ctx.lineWidth=0.5; ctx.stroke(); }
    }
    requestAnimationFrame(draw);
  }
  draw();
})();
