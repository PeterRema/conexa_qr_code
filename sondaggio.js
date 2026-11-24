import QRCode from 'https://esm.sh/qrcode@1.5.4';
import { db, configured, $, esc, loadPoll, currentSession, loadCounts, percent, questionHint, voteUrl, shortUrl, toast, throttled, errorCode } from './common.js';

// Pagina fissa da proiettare: sondaggio.html?p=<slug>
// Mostra il QR del link fisso, lo stato della votazione e i risultati live.
const slug = new URLSearchParams(location.search).get('p');
let poll = null, session = null, isAdmin = false, countsChannel = null;
const hideKey = `conexa-hide-${slug}`;
let hideResults = localStorage.getItem(hideKey) === '1';

start();

async function start() {
  if (!configured) return message('Configura config.js e database.sql prima di usare questa pagina.');
  if (!slug) return message('Manca il sondaggio nel link: usa sondaggio.html?p=<codice> (lo trovi nella gestione).');
  poll = await loadPoll(slug);
  if (!poll) return message(`Il sondaggio “${esc(slug)}” non esiste. Controlla il link nella gestione.`);
  renderTitle();
  await drawQR();
  session = await currentSession(slug);
  watchCounts();
  await render();
  checkAdmin();
  db.auth.onAuthStateChange(() => checkAdmin());

  db.channel(`presenter-${slug}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_sessions', filter: `poll_slug=eq.${slug}` }, refreshSession)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'poll_sessions' }, refreshSession)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'poll_catalog', filter: `slug=eq.${slug}` }, reloadPoll)
    .subscribe();
  setInterval(refreshSession, 5000); // riserva se il realtime cade
}

function renderTitle() { $('title').textContent = poll.name; document.title = `${poll.name} · Conexa Live`; }

async function drawQR() {
  const url = voteUrl(slug);
  $('joinUrl').textContent = shortUrl(url);
  const canvas = document.createElement('canvas');
  try {
    await QRCode.toCanvas(canvas, url, { width: 720, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#080a20', light: '#ffffff' } });
    $('qr').innerHTML = ''; $('qr').appendChild(canvas);
  } catch { $('qr').textContent = 'QR non disponibile'; }
}

const refreshSession = throttled(async () => {
  const next = await currentSession(slug);
  const changed = next?.id !== session?.id || next?.round !== session?.round;
  session = next;
  if (changed) watchCounts();
  await render();
}, 250, 0);

const reloadPoll = throttled(async () => {
  const fresh = await loadPoll(slug);
  if (fresh) { poll = fresh; renderTitle(); await render(); }
}, 250, 0);

function watchCounts() {
  if (countsChannel) { db.removeChannel(countsChannel); countsChannel = null; }
  if (!session) return;
  countsChannel = db.channel(`presenter-counts-${session.id}-${session.round}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'response_counts', filter: `session_id=eq.${session.id}` }, refreshCounts)
    .subscribe();
}
const refreshCounts = throttled(() => render(), 600, 0);

async function render() {
  const state = $('state');
  state.className = 'state' + (session ? ` ${session.status}` : '');
  $('stateText').textContent = !session ? 'In attesa di avvio' : session.status === 'open' ? 'Votazione aperta' : 'Votazione chiusa';
  updateButtons();

  if (!session) {
    $('count').textContent = '0';
    $('results').innerHTML = poll.questions.map((q, i) => questionCard(q, i, null, 0)).join('');
    return;
  }
  let counts, participants;
  try {
    const [c, s] = await Promise.all([loadCounts(poll, session.id), db.from('poll_sessions').select('participants').eq('id', session.id).maybeSingle()]);
    counts = c; participants = Number(s.data?.participants ?? 0);
  } catch { return; }
  $('count').textContent = participants.toLocaleString('it-IT');
  $('results').innerHTML = poll.questions.map((q, i) => questionCard(q, i, counts[i], participants)).join('');
}

function questionCard(q, qi, values, participants) {
  const showBars = values && !hideResults;
  const best = values ? Math.max(...values) : 0;
  const bars = q.options.map((o, oi) => {
    const v = values ? values[oi] : 0, pct = percent(v, participants);
    return `<div class="bar ${showBars && best > 0 && v === best ? 'best' : ''}"><span class="bar-label">${esc(o)}</span><span class="bar-pct">${showBars ? pct + '%' : ''}</span><div class="track"><div class="fill" style="width:${showBars ? pct : 0}%"></div></div></div>`;
  }).join('');
  return `<article class="q"><div class="q-head"><span class="tag">DOMANDA ${String(qi + 1).padStart(2, '0')}</span>${q.multiple ? `<span class="tag multi">${esc(questionHint(q).toUpperCase())}</span>` : ''}</div><h2>${esc(q.text)}</h2><div class="bars">${bars}</div></article>`;
}

// --------------------------------------------------------------------------
// Comandi (solo amministratori collegati nello stesso browser)
// --------------------------------------------------------------------------

async function checkAdmin() {
  const { data: { session: auth } } = await db.auth.getSession();
  if (!auth) isAdmin = false;
  else { const { data } = await db.rpc('is_admin'); isAdmin = data === true; }
  $('admin').classList.toggle('hidden', !isAdmin);
  $('guest').classList.toggle('hidden', isAdmin);
  updateButtons();
}

function updateButtons() {
  const open = session?.status === 'open';
  $('btnStart').textContent = session ? 'Nuova votazione' : 'Avvia votazione';
  $('btnStart').title = session ? 'Chiude la votazione attuale e ne apre una nuova; la precedente resta nello storico' : '';
  $('btnClose').disabled = !open;
  $('btnReset').disabled = !session;
  const label = hideResults ? 'Mostra risultati' : 'Nascondi risultati';
  $('btnToggle').textContent = label; $('btnToggleGuest').textContent = label;
}

async function call(fn, args, okText) {
  const { error } = await db.rpc(fn, args);
  if (error) { toast(errorCode(error) === 'NOT_ADMIN' ? 'Questo account non ha i permessi di gestione.' : 'Operazione non riuscita. Riprova.'); return false; }
  toast(okText); await refreshNow(); return true;
}
async function refreshNow() { session = await currentSession(slug); watchCounts(); await render(); }

$('btnStart').onclick = async () => {
  if (session?.status === 'open' && !confirm('C’è già una votazione aperta. Chiuderla e aprirne una nuova? I risultati attuali restano nello storico.')) return;
  await call('start_session', { p_slug: slug }, 'Votazione aperta.');
};
$('btnClose').onclick = async () => {
  if (!session || !confirm('Chiudere la votazione? Non saranno più accettati voti.')) return;
  await call('close_session', { p_session_id: session.id }, 'Votazione chiusa.');
};
$('btnReset').onclick = async () => {
  if (!session || !confirm('Azzerare tutti i voti di questa votazione e riaprirla? L’operazione non si può annullare.')) return;
  await call('reset_session', { p_session_id: session.id }, 'Voti azzerati, votazione riaperta.');
};
function toggleResults() { hideResults = !hideResults; localStorage.setItem(hideKey, hideResults ? '1' : '0'); render(); }
$('btnToggle').onclick = toggleResults; $('btnToggleGuest').onclick = toggleResults;
function toggleFull() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); }
$('btnFull').onclick = toggleFull;
document.addEventListener('keydown', e => {
  if (e.target.closest('input,textarea,select') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.toLowerCase() === 'r') toggleResults();
  if (e.key.toLowerCase() === 'f') toggleFull();
});

function message(text) {
  $('title').textContent = 'Conexa Live';
  $('stateText').textContent = 'Non disponibile';
  $('results').innerHTML = `<div class="notice-card">${text}</div>`;
  $('qr').classList.add('hidden'); $('joinUrl').textContent = '';
}
