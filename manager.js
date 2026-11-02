import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import QRCode from 'https://esm.sh/qrcode@1.5.4';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { POLLS } from './polls.js';

const $ = (id) => document.getElementById(id);
const configured = !SUPABASE_URL.includes('YOUR_PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR_');
let db, sessions = [], customPolls = [], selected = null, channel = null, toastTimer;
let currentUserId = null, isAdmin = false, refreshTimer = null, refreshing = false, refreshAgain = false;

renderQuestionBuilder();
renderPollChoices();
if (!configured) {
  $('setupNotice').classList.remove('hidden');
  $('login').classList.add('hidden');
  $('createSession').disabled = true;
} else {
  $('setupNotice').classList.add('hidden');
  db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  boot();
}

// ---------------------------------------------------------------------------
// Accesso
// ---------------------------------------------------------------------------

async function boot() {
  const { data: { session } } = await db.auth.getSession();
  if (session) showAdmin(session.user); else $('login').classList.remove('hidden');
  db.auth.onAuthStateChange((_event, session) => {
    if (session) showAdmin(session.user);
    else {
      currentUserId = null; isAdmin = false;
      $('login').classList.remove('hidden'); $('logout').classList.add('hidden'); $('adminEmail').textContent = '';
      $('adminNotice').classList.add('hidden');
    }
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

async function showAdmin(user) {
  // onAuthStateChange scatta anche al rinnovo del token: ricarica solo al cambio utente.
  if (currentUserId === user.id) return;
  currentUserId = user.id;
  $('login').classList.add('hidden'); $('logout').classList.remove('hidden');
  $('adminEmail').textContent = user.email || 'Amministratore';
  const { data, error } = await db.rpc('is_admin');
  isAdmin = !error && data === true;
  applyAdminState(error);
  await loadCustomPolls();
  await refreshSessions();
}

function applyAdminState(error) {
  const notice = $('adminNotice');
  if (isAdmin) { notice.classList.add('hidden'); }
  else {
    notice.textContent = error
      ? 'Database da aggiornare: esegui di nuovo database.sql in Supabase per abilitare la gestione.'
      : 'Questo account può vedere lo storico ma non gestire sessioni e modelli. Aggiungilo a poll_admins in Supabase (vedi README).';
    notice.classList.remove('hidden');
  }
  ['createSession', 'saveCustomPoll', 'archivePoll'].forEach(id => { $(id).disabled = !isAdmin; });
}

// ---------------------------------------------------------------------------
// Modelli di sondaggio
// ---------------------------------------------------------------------------

function toPoll(row) {
  return { slug: row.slug, name: row.title, archived: !!row.archived, custom: true,
    questions: (row.questions || []).map(q => [q.text, q.options]) };
}

function renderPollChoices() {
  const keep = $('pollChoice').value;
  const available = [...POLLS, ...customPolls.filter(p => !p.archived)];
  $('pollChoice').innerHTML = available.map(p => `<option value="${esc(p.slug)}">${esc(p.name)}${p.custom ? ' · personalizzato' : ''}</option>`).join('');
  if (keep && available.some(p => p.slug === keep)) $('pollChoice').value = keep;
  updateArchiveButton();
}

function updateArchiveButton() {
  const isCustom = customPolls.some(p => p.slug === $('pollChoice').value);
  $('archivePoll').classList.toggle('hidden', !isCustom);
}
$('pollChoice').addEventListener('change', updateArchiveButton);

function renderQuestionBuilder() {
  $('questionBuilder').innerHTML = [0,1,2].map(i => `<div class="question-block"><strong>DOMANDA ${i+1}</strong><label for="customQuestion${i}">TESTO DELLA DOMANDA</label><textarea id="customQuestion${i}" maxlength="220" placeholder="Scrivi la domanda"></textarea><label for="customOptions${i}">OPZIONI · UNA PER RIGA (MAX 120 CARATTERI)</label><textarea id="customOptions${i}" placeholder="Opzione 1&#10;Opzione 2&#10;Opzione 3"></textarea></div>`).join('');
}

async function loadCustomPolls() {
  const { data, error } = await db.from('poll_catalog').select('slug,title,questions,archived').not('title','is',null).order('title');
  if (error) { toast('Modelli personalizzati non caricati. Esegui di nuovo database.sql.'); customPolls = []; }
  else customPolls = (data || []).map(toPoll);
  renderPollChoices();
}

async function getPoll(slug) {
  const fixed = POLLS.find(p => p.slug === slug);
  if (fixed) return fixed;
  const cached = customPolls.find(p => p.slug === slug);
  if (cached) return cached;
  const { data } = await db.from('poll_catalog').select('slug,title,questions,archived').eq('slug', slug).single();
  if (!data?.title) return null;
  const poll = toPoll(data); customPolls.push(poll);
  return poll;
}

$('saveCustomPoll').onclick = createCustomPoll;
async function createCustomPoll() {
  if (!isAdmin) return;
  const title = $('newPollTitle').value.trim();
  const questions = [0,1,2].map(i => ({
    text: $(`customQuestion${i}`).value.trim(),
    options: $(`customOptions${i}`).value.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  }));
  if (!title) return setBuilderStatus('Inserisci il titolo del sondaggio.');
  const invalid = questions.findIndex(q => !q.text || q.options.length < 2 || q.options.length > 10);
  if (invalid >= 0) return setBuilderStatus(`Completa la domanda ${invalid+1} con 2–10 opzioni.`);
  const long = questions.findIndex(q => q.options.some(o => o.length > 120));
  if (long >= 0) return setBuilderStatus(`Domanda ${long+1}: ogni opzione deve stare entro 120 caratteri.`);
  const dup = questions.findIndex(q => new Set(q.options.map(o => o.toLowerCase())).size !== q.options.length);
  if (dup >= 0) return setBuilderStatus(`Domanda ${dup+1}: ci sono opzioni ripetute.`);
  $('saveCustomPoll').disabled = true; setBuilderStatus('Salvataggio…');
  const slug = `custom-${crypto.randomUUID().replaceAll('-','')}`;
  const { error } = await db.from('poll_catalog').insert({
    slug, title, questions,
    option_counts: questions.map(q => q.options.length)
  });
  $('saveCustomPoll').disabled = false;
  if (error) return setBuilderStatus('Salvataggio non riuscito. Verifica i permessi di amministratore e i limiti dei testi.');
  await loadCustomPolls(); $('pollChoice').value = slug; updateArchiveButton();
  const { data: session, error: sessionError } = await db.from('poll_sessions').insert({ poll_slug: slug }).select('id,poll_slug,status,created_at,closed_at').single();
  if (sessionError) { setBuilderStatus('Modello salvato. Premi “Avvia sessione” per creare il QR.'); toast('Modello salvato, avvio sessione non riuscito.'); return; }
  selected = session; $('newPollTitle').value = ''; renderQuestionBuilder(); setBuilderStatus('Modello salvato e sessione avviata.');
  await refreshSessions(); toast('Sondaggio creato. Il QR è pronto.');
}
function setBuilderStatus(message) { $('builderStatus').textContent = message; }

$('archivePoll').onclick = async () => {
  if (!isAdmin) return;
  const poll = customPolls.find(p => p.slug === $('pollChoice').value);
  if (!poll) return;
  if (!confirm(`Togliere “${poll.name}” dall’elenco dei modelli? Sessioni e risultati già raccolti restano nello storico.`)) return;
  const { error } = await db.from('poll_catalog').update({ archived: true }).eq('slug', poll.slug);
  if (error) { toast('Non riesco a togliere il modello. Verifica i permessi.'); return; }
  poll.archived = true; renderPollChoices(); toast('Modello tolto dall’elenco.');
};

// ---------------------------------------------------------------------------
// Sessioni
// ---------------------------------------------------------------------------

async function refreshSessions() {
  if (refreshing) { refreshAgain = true; return; }
  refreshing = true;
  try {
    const { data, error } = await db.from('poll_sessions').select('id,poll_slug,status,created_at,closed_at').order('created_at', { ascending: false });
    if (error) { toast('Non riesco a caricare le sessioni. Controlla database.sql e i permessi.'); return; }
    sessions = data || []; $('sessionNumber').textContent = sessions.length;
    const all = [...POLLS, ...customPolls];
    $('sessionList').innerHTML = sessions.length ? sessions.map(s => {
      const poll = all.find(p => p.slug === s.poll_slug);
      return `<button class="session ${selected?.id === s.id ? 'active' : ''}" data-id="${s.id}"><span class="status ${s.status === 'closed' ? 'closed' : ''}">${s.status === 'open' ? '● APERTO' : 'ARCHIVIATO'}</span><strong>${esc(poll?.name || s.poll_slug)}</strong><small>${new Date(s.created_at).toLocaleString('it-IT')}</small></button>`;
    }).join('') : '<div class="empty">Nessuna sessione ancora. Avviane una dal pannello a destra.</div>';
    document.querySelectorAll('.session').forEach(b => b.onclick = () => selectSession(sessions.find(s => s.id === b.dataset.id)));
    if (selected) selected = sessions.find(s => s.id === selected.id) || null;
    if (selected) await renderSession();
    else { stopChannel(); $('sessionView').innerHTML = '<div class="empty">Seleziona una sessione nello storico o avviane una nuova.</div>'; renderQR(null); }
  } finally {
    refreshing = false;
    if (refreshAgain) { refreshAgain = false; refreshSessions(); }
  }
}

$('createSession').onclick = async () => {
  if (!isAdmin) return;
  $('createSession').disabled = true;
  const { data, error } = await db.from('poll_sessions').insert({ poll_slug: $('pollChoice').value }).select('id,poll_slug,status,created_at,closed_at').single();
  $('createSession').disabled = false;
  if (error) { toast('Creazione non riuscita. Verifica i permessi di amministratore.'); return; }
  selected = data; await refreshSessions(); toast('Sessione avviata. Il QR è pronto.');
};

function selectSession(session) { selected = session; refreshSessions(); }

function stopChannel() { if (channel) { db.removeChannel(channel); channel = null; } clearTimeout(refreshTimer); }

async function renderSession() {
  if (!selected) return;
  const session = selected, poll = await getPoll(session.poll_slug);
  stopChannel();
  if (!poll) { $('sessionView').innerHTML = '<div class="empty">Modello del sondaggio non trovato.</div>'; renderQR(session); return; }
  const { data: countRows, error } = await db.from('response_counts').select('question_index,option_index,vote_count').eq('session_id', session.id);
  if (error) { toast('Non riesco a leggere i risultati aggregati.'); return; }
  $('sessionView').innerHTML = sessionMarkup(session, poll, countRows || []);
  $('closeSession')?.addEventListener('click', closeSession);
  renderQR(session);
  if (session.status === 'open') {
    channel = db.channel(`session-${session.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'response_counts', filter: `session_id=eq.${session.id}` }, scheduleRefresh)
      .subscribe();
  }
}

// Durante una raffica di voti aggiorna al massimo una volta ogni 800 ms.
function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(async () => { refreshTimer = null; await refreshSessionView(); }, 800);
}

async function refreshSessionView() {
  const currentId = selected?.id;
  if (!currentId) return;
  const { data } = await db.from('response_counts').select('question_index,option_index,vote_count').eq('session_id', currentId);
  if (!data || selected?.id !== currentId) return;
  const poll = await getPoll(selected.poll_slug);
  if (!poll) return;
  const all = Array.from({ length: 3 }, (_, q) => data.filter(r => r.question_index === q).reduce((n, r) => n + Number(r.vote_count), 0));
  const total = Math.max(0, ...all);
  const answers = new Map(data.map(r => [`${r.question_index}-${r.option_index}`, Number(r.vote_count)]));
  if ($('responsesTotal')) $('responsesTotal').textContent = total.toLocaleString('it-IT');
  if ($('questions')) $('questions').innerHTML = poll.questions.map((q, qi) => questionMarkup(q, qi, answers)).join('');
}

function sessionMarkup(session, poll, rows) {
  const answers = new Map(rows.map(r => [`${r.question_index}-${r.option_index}`, Number(r.vote_count)]));
  const totals = [0,1,2].map(q => rows.filter(r => r.question_index === q).reduce((n,r) => n + Number(r.vote_count), 0));
  return `<div class="session-title"><div><h2>${esc(poll.name)}</h2><p>Avviato il ${new Date(session.created_at).toLocaleString('it-IT')} · codice ${session.id.slice(0,8)}${session.closed_at ? ` · chiuso il ${new Date(session.closed_at).toLocaleString('it-IT')}` : ''}</p></div><span class="state ${session.status === 'closed' ? 'closed' : ''}">${session.status === 'open' ? '● In corso' : 'Sessione archiviata'}</span></div>
    <div class="stats"><div class="stat"><strong id="responsesTotal">${Math.max(0,...totals)}</strong><span>partecipanti</span></div><div class="stat"><strong>03</strong><span>domande</span></div></div>
    ${session.status === 'open' && isAdmin ? '<div style="margin-bottom:14px"><button class="btn danger" id="closeSession">Chiudi e archivia sessione</button></div>' : ''}
    <div class="questions" id="questions">${poll.questions.map((q,qi)=>questionMarkup(q,qi,answers)).join('')}</div>`;
}

function questionMarkup(q, qi, counts) {
  const vals = q[1].map((_, oi) => counts.get(`${qi}-${oi}`) || 0);
  const total = vals.reduce((a,b)=>a+b,0);
  return `<article class="qrow"><h3>${qi+1}. ${esc(q[0])}</h3><div class="bars">${q[1].map((option,oi)=>{const pct=total?Math.round(vals[oi]/total*100):0;return `<div class="barrow"><span class="barlabel" title="${esc(option)}">${esc(option)}</span><span class="track"><span class="fill" style="display:block;width:${pct}%"></span></span><span class="pct">${pct}% · ${vals[oi]}</span></div>`}).join('')}</div></article>`;
}

async function closeSession() {
  if (!selected || !isAdmin) return;
  if (!confirm('Chiudere la sessione? Non saranno più accettati voti.')) return;
  const { error } = await db.from('poll_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', selected.id);
  if (error) { toast('Non riesco ad archiviare la sessione.'); return; }
  toast('Sessione chiusa e archiviata.'); await refreshSessions();
}

async function renderQR(session) {
  const area = $('qrArea');
  if (!session) { area.innerHTML = '<span class="qr-placeholder">QR sessione</span>'; $('qrHint').textContent = 'Seleziona una sessione per mostrare il QR code.'; $('clientLink').textContent = ''; return; }
  const url = new URL('./client.html', location.href); url.searchParams.set('session', session.id);
  $('qrHint').textContent = session.status === 'open' ? 'Inquadra questo QR con lo smartphone per votare.' : 'Sessione chiusa: il QR apre i risultati finali.';
  $('clientLink').innerHTML = `<a href="${esc(url.href)}" target="_blank" rel="noopener" style="color:#83dcff">Apri pagina partecipante ↗</a>`;
  try {
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, url.href, { width: 134, margin: 1, color: { dark: '#080a20', light: '#ffffff' } });
    area.innerHTML = ''; area.appendChild(canvas);
  } catch { area.innerHTML = '<span class="qr-placeholder">QR non disponibile</span>'; }
}

function esc(value = '') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(text) { $('toast').textContent = text; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2600); }
