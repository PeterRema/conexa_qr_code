import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import QRCode from 'https://esm.sh/qrcode@1.5.4';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { POLLS } from './polls.js';

const $ = (id) => document.getElementById(id);
const configured = !SUPABASE_URL.includes('YOUR_PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR_');
let db, sessions = [], selected = null, channel = null, toastTimer;

$('pollChoice').innerHTML = POLLS.map(p => `<option value="${p.slug}">${p.name}</option>`).join('');
if (!configured) {
  $('setupNotice').classList.remove('hidden');
  $('login').classList.add('hidden');
  $('createSession').disabled = true;
} else {
  $('setupNotice').classList.add('hidden');
  db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  boot();
}

async function boot() {
  const { data: { session } } = await db.auth.getSession();
  if (session) showAdmin(session.user); else $('login').classList.remove('hidden');
  db.auth.onAuthStateChange((_event, session) => {
    if (session) showAdmin(session.user);
    else { $('login').classList.remove('hidden'); $('logout').classList.add('hidden'); $('adminEmail').textContent = ''; }
  });
}

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault(); $('loginButton').disabled = true; $('loginError').textContent = '';
  const { data, error } = await db.auth.signInWithPassword({ email: $('email').value, password: $('password').value });
  $('loginButton').disabled = false;
  if (error) $('loginError').textContent = 'Accesso non riuscito. Controlla email e password.';
  else showAdmin(data.user);
});
$('logout').onclick = () => db.auth.signOut();

function showAdmin(user) {
  $('login').classList.add('hidden'); $('logout').classList.remove('hidden');
  $('adminEmail').textContent = user.email || 'Amministratore';
  refreshSessions();
}

async function refreshSessions() {
  const { data, error } = await db.from('poll_sessions').select('id,poll_slug,status,created_at,closed_at').order('created_at', { ascending: false });
  if (error) { toast('Non riesco a caricare le sessioni. Controlla database.sql e i permessi.'); return; }
  sessions = data || []; $('sessionNumber').textContent = sessions.length;
  $('sessionList').innerHTML = sessions.length ? sessions.map(s => {
    const poll = POLLS.find(p => p.slug === s.poll_slug);
    return `<button class="session ${selected?.id === s.id ? 'active' : ''}" data-id="${s.id}"><span class="status ${s.status === 'closed' ? 'closed' : ''}">${s.status === 'open' ? '● APERTO' : 'ARCHIVIATO'}</span><strong>${esc(poll?.name || s.poll_slug)}</strong><small>${new Date(s.created_at).toLocaleString('it-IT')}</small></button>`;
  }).join('') : '<div class="empty">Nessuna sessione ancora. Avviane una dal pannello a destra.</div>';
  document.querySelectorAll('.session').forEach(b => b.onclick = () => selectSession(sessions.find(s => s.id === b.dataset.id)));
  if (selected) selected = sessions.find(s => s.id === selected.id) || null;
  if (selected) await renderSession(); else { $('sessionView').innerHTML = '<div class="empty">Seleziona una sessione nello storico o avviane una nuova.</div>'; renderQR(null); }
}

$('createSession').onclick = async () => {
  const { data, error } = await db.from('poll_sessions').insert({ poll_slug: $('pollChoice').value }).select('id,poll_slug,status,created_at,closed_at').single();
  if (error) { toast('Creazione non riuscita. Verifica di aver eseguito database.sql.'); return; }
  selected = data; await refreshSessions(); selectSession(data); toast('Sessione avviata. Il QR è pronto.');
};

function selectSession(session) { selected = session; refreshSessions(); }

async function renderSession() {
  if (!selected) return;
  const session = selected, poll = POLLS.find(p => p.slug === session.poll_slug);
  if (!poll) return;
  if (channel) { db.removeChannel(channel); channel = null; }
  const { data: countRows, error } = await db.from('response_counts').select('question_index,option_index,vote_count').eq('session_id', session.id);
  if (error) { toast('Non riesco a leggere i risultati aggregati.'); return; }
  $('sessionView').innerHTML = sessionMarkup(session, poll, countRows || []);
  $('closeSession')?.addEventListener('click', closeSession);
  renderQR(session);
  if (session.status === 'open') {
    channel = db.channel(`session-${session.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'response_counts', filter: `session_id=eq.${session.id}` }, () => refreshSessionView())
      .subscribe();
  }
}

async function refreshSessionView() {
  const currentId = selected?.id;
  if (!currentId) return;
  const { data } = await db.from('response_counts').select('question_index,option_index,vote_count').eq('session_id', currentId);
  if (!data) return;
  const poll = POLLS.find(p => p.slug === selected.poll_slug);
  const all = Array.from({ length: 3 }, (_, q) => data.filter(r => r.question_index === q).reduce((n, r) => n + Number(r.vote_count), 0));
  const total = Math.max(0, ...all);
  const answers = new Map(data.map(r => [`${r.question_index}-${r.option_index}`, Number(r.vote_count)]));
  $('responsesTotal') && ($('responsesTotal').textContent = total.toLocaleString('it-IT'));
  $('questions').innerHTML = poll.questions.map((q, qi) => questionMarkup(q, qi, answers)).join('');
}

function sessionMarkup(session, poll, rows) {
  const answers = new Map(rows.map(r => [`${r.question_index}-${r.option_index}`, Number(r.vote_count)]));
  const totals = [0,1,2].map(q => rows.filter(r => r.question_index === q).reduce((n,r) => n + Number(r.vote_count), 0));
  return `<div class="session-title"><div><h2>${esc(poll.name)}</h2><p>Avviato il ${new Date(session.created_at).toLocaleString('it-IT')} · codice ${session.id.slice(0,8)}</p></div><span class="state ${session.status === 'closed' ? 'closed' : ''}">${session.status === 'open' ? '● In corso' : 'Sessione archiviata'}</span></div>
    <div class="stats"><div class="stat"><strong id="responsesTotal">${Math.max(0,...totals)}</strong><span>partecipanti</span></div><div class="stat"><strong>03</strong><span>domande</span></div></div>
    ${session.status === 'open' ? '<div style="margin-bottom:14px"><button class="btn danger" id="closeSession">Chiudi e archivia sessione</button></div>' : ''}
    <div class="questions" id="questions">${poll.questions.map((q,qi)=>questionMarkup(q,qi,answers)).join('')}</div>`;
}

function questionMarkup(q, qi, counts) {
  const vals = q[1].map((_, oi) => counts.get(`${qi}-${oi}`) || 0);
  const total = vals.reduce((a,b)=>a+b,0);
  return `<article class="qrow"><h3>${qi+1}. ${esc(q[0])}</h3><div class="bars">${q[1].map((option,oi)=>{const pct=total?Math.round(vals[oi]/total*100):0;return `<div class="barrow"><span class="barlabel">${esc(option)}</span><span class="track"><span class="fill" style="display:block;width:${pct}%"></span></span><span class="pct">${pct}% · ${vals[oi]}</span></div>`}).join('')}</div></article>`;
}

async function closeSession() {
  if (!selected) return;
  const { error } = await db.from('poll_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', selected.id);
  if (error) { toast('Non riesco ad archiviare la sessione.'); return; }
  toast('Sessione chiusa e archiviata.'); await refreshSessions();
}

async function renderQR(session) {
  const area = $('qrArea');
  if (!session) { area.innerHTML = '<span class="qr-placeholder">QR sessione</span>'; $('qrHint').textContent='Seleziona una sessione per mostrare il QR code.'; $('clientLink').textContent=''; return; }
  const url = new URL('./client.html', location.href); url.searchParams.set('session', session.id);
  $('qrHint').textContent = session.status === 'open' ? 'Inquadra questo QR con lo smartphone per votare.' : 'Sessione chiusa: il QR apre lo storico dei risultati.';
  $('clientLink').innerHTML = `<a href="${esc(url.href)}" target="_blank" style="color:#83dcff">Apri pagina partecipante ↗</a>`;
  try { area.innerHTML=''; await QRCode.toCanvas(url.href, { width: 134, margin: 1, color: { dark:'#080a20', light:'#ffffff' } }, (err, canvas) => { if (err) area.innerHTML='<span class="qr-placeholder">QR non disponibile</span>'; else area.appendChild(canvas); }); }
  catch { area.innerHTML='<span class="qr-placeholder">QR non disponibile</span>'; }
}

function esc(value='') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(text) { $('toast').textContent=text; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600); }
