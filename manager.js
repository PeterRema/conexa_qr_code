import QRCode from 'https://esm.sh/qrcode@1.5.4';
import { db, configured, $, esc, toPoll, loadCounts, percent, questionHint, voteUrl, presenterUrl, shortUrl, slugify, errorCode, toast, throttled } from './common.js';

let isAdmin = false, currentUserId = null;
let models = [], sessions = [], selectedSessionId = null, countsChannel = null;
let editing = null, editingSlug = null, dirty = false, slugTouched = false, pollTimer = null;

if (!configured) {
  $('setupNotice').classList.remove('hidden');
  $('createSession').disabled = true;
} else {
  $('setupNotice').classList.add('hidden');
  boot();
}

// ==========================================================================
// Accesso
// ==========================================================================

async function boot() {
  const { data: { session } } = await db.auth.getSession();
  if (session) showAdmin(session.user); else $('login').classList.remove('hidden');
  db.auth.onAuthStateChange((_e, session) => {
    if (session) showAdmin(session.user);
    else { currentUserId = null; isAdmin = false; $('login').classList.remove('hidden'); $('logout').classList.add('hidden'); $('adminEmail').textContent = ''; }
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
  if (currentUserId === user.id) return;
  currentUserId = user.id;
  $('login').classList.add('hidden'); $('logout').classList.remove('hidden');
  $('adminEmail').textContent = user.email || 'Amministratore';
  const { data, error } = await db.rpc('is_admin');
  isAdmin = !error && data === true;
  const notice = $('adminNotice');
  if (isAdmin) notice.classList.add('hidden');
  else {
    notice.textContent = error ? 'Database da aggiornare: esegui database.sql (v3) in Supabase.' : 'Questo account può consultare ma non gestire. Aggiungilo a poll_admins in Supabase (vedi README).';
    notice.classList.remove('hidden');
  }
  ['createSession', 'newModel', 'modelStart', 'modelArchive', 'modelDelete'].forEach(id => $(id).disabled = !isAdmin);
  await loadModels();
  await loadSessions();
  db.channel('manager-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_sessions' }, refreshSessions)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_catalog' }, refreshModels)
    .subscribe();
  if (!pollTimer) pollTimer = setInterval(() => { if (!document.hidden && !$('tabSessions').classList.contains('hidden')) refreshSessions(); }, 10000);
}

// ==========================================================================
// Schede
// ==========================================================================

function showTab(name) {
  const models = name === 'models';
  if (!models && dirty && !confirm('Ci sono modifiche non salvate al modello. Uscire senza salvare?')) return;
  if (!models && dirty) { dirty = false; openModel(editingSlug); }
  $('tabSessions').classList.toggle('hidden', models); $('tabModels').classList.toggle('hidden', !models);
  $('tabBtnSessions').setAttribute('aria-selected', String(!models)); $('tabBtnModels').setAttribute('aria-selected', String(models));
}
$('tabBtnSessions').onclick = () => { showTab('sessions'); if (currentUserId) loadSessions(); };
$('tabBtnModels').onclick = () => showTab('models');
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

// ==========================================================================
// Modelli
// ==========================================================================

async function loadModels() {
  const { data, error } = await db.from('poll_catalog').select('slug,title,questions,archived,position').order('position').order('title');
  if (error) { toast('Modelli non caricati: esegui database.sql (v3) in Supabase.'); return; }
  models = (data || []).map(toPoll).filter(Boolean);
  renderModelList(); renderPollChoices(); renderFilter();
  if (editingSlug && !dirty) openModel(editingSlug, true);
}
const refreshModels = throttled(loadModels, 400);
const modelBySlug = (slug) => models.find(m => m.slug === slug);

function renderModelList() {
  $('modelNumber').textContent = models.length;
  const counts = sessions.reduce((m, s) => (m[s.poll_slug] = (m[s.poll_slug] || 0) + 1, m), {});
  $('modelList').innerHTML = models.length ? models.map(m => `<button class="model ${m.slug === editingSlug ? 'active' : ''} ${m.archived ? 'archived' : ''}" data-slug="${esc(m.slug)}"><strong>${esc(m.name)}${m.archived ? '<span class="tagm off">NASCOSTO</span>' : ''}</strong><small>${m.questions.length} ${m.questions.length === 1 ? 'domanda' : 'domande'} · ${counts[m.slug] || 0} sessioni · ${esc(m.slug)}</small></button>`).join('')
    : '<div class="empty">Nessun modello. Creane uno con “Nuovo modello”.</div>';
  document.querySelectorAll('.model').forEach(b => b.onclick = () => {
    if (b.dataset.slug === editingSlug) return;
    if (dirty && !confirm('Ci sono modifiche non salvate. Aprire un altro modello senza salvare?')) return;
    openModel(b.dataset.slug);
  });
}

function renderPollChoices() {
  const keep = $('pollChoice').value;
  const visible = models.filter(m => !m.archived);
  $('pollChoice').innerHTML = visible.map(m => `<option value="${esc(m.slug)}">${esc(m.name)}</option>`).join('');
  if (visible.some(m => m.slug === keep)) $('pollChoice').value = keep;
}

function renderFilter() {
  const keep = $('sessionFilter').value;
  $('sessionFilter').innerHTML = '<option value="">Tutti i sondaggi</option>' + models.map(m => `<option value="${esc(m.slug)}">${esc(m.name)}</option>`).join('');
  $('sessionFilter').value = models.some(m => m.slug === keep) ? keep : '';
}

$('newModel').onclick = () => {
  if (dirty && !confirm('Ci sono modifiche non salvate. Iniziare un nuovo modello senza salvare?')) return;
  editingSlug = null; slugTouched = false; dirty = false;
  editing = { slug: '', name: '', questions: [blankQuestion()] };
  renderModelList(); renderEditor(); renderModelSide();
};
const blankQuestion = () => ({ text: '', multiple: false, max: null, options: [] });

function openModel(slug, keepScroll = false) {
  const m = modelBySlug(slug);
  if (!m) { editingSlug = null; editing = null; dirty = false; renderModelList(); renderEditor(); renderModelSide(); return; }
  editingSlug = slug; dirty = false;
  editing = JSON.parse(JSON.stringify(m));
  renderModelList(); renderEditor(keepScroll); renderModelSide();
}

// --- Editor -----------------------------------------------------------------

function renderEditor() {
  const el = $('editor');
  if (!editing) { el.innerHTML = '<div class="empty">Seleziona un modello o creane uno nuovo.</div>'; return; }
  const isNew = !editingSlug;
  el.innerHTML = `
    <div class="session-title"><div><h2>${isNew ? 'Nuovo modello' : esc(editing.name || 'Modello')}</h2><p>${isNew ? 'Scegli titolo, domande e tipo di risposta.' : 'Le modifiche ai testi arrivano subito anche ai telefoni già collegati.'}</p></div>${!isNew && editing.archived ? '<span class="state closed">Nascosto</span>' : ''}</div>
    <label for="edTitle">Titolo</label><input id="edTitle" value="${esc(editing.name)}" placeholder="Es. Comfort termico · ABB">
    <label for="edSlug">Codice del link</label><input id="edSlug" value="${esc(isNew ? editing.slug : editingSlug)}" ${isNew ? '' : 'readonly'} placeholder="es. comfort-abb" spellcheck="false">
    <p class="hint">${isNew ? 'Lettere minuscole, numeri e trattini. Diventa parte del link fisso e non si potrà cambiare.' : 'Il codice non cambia: i link già inseriti nella presentazione restano validi.'}</p>
    <div id="edQuestions">${editing.questions.map(questionEditor).join('')}</div>
    <button class="btn full" id="edAdd" type="button" style="margin-top:12px">+ Aggiungi domanda</button>
    <p class="hint">Puoi correggere i testi anche dopo la votazione. Se cambi il numero di domande o di opzioni, oppure il tipo di risposta, i voti già raccolti per questo sondaggio vanno azzerati: te lo chiederò al salvataggio.</p>
    <div class="editor-foot"><button class="btn primary" id="edSave" type="button">${isNew ? 'Crea modello' : 'Salva modifiche'}</button>${isNew ? '' : '<button class="btn" id="edRevert" type="button">Annulla modifiche</button>'}<span class="status-line" id="edStatus"></span></div>`;
  bindEditor();
}

function questionEditor(q, i) {
  const n = editing.questions.length;
  const opts = q.options.join('\n');
  return `<div class="qedit" data-i="${i}">
    <div class="qedit-head"><strong>Domanda ${i + 1}</strong>
      <button class="icon" data-act="up" title="Sposta su" aria-label="Sposta su" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="icon" data-act="down" title="Sposta giù" aria-label="Sposta giù" ${i === n - 1 ? 'disabled' : ''}>↓</button>
      <button class="icon" data-act="dup" title="Duplica" aria-label="Duplica">⧉</button>
      <button class="icon del" data-act="del" title="Elimina domanda" aria-label="Elimina domanda" ${n === 1 ? 'disabled' : ''}>✕</button></div>
    <label for="qText${i}">Testo della domanda</label><textarea id="qText${i}" data-f="text" rows="2" placeholder="Scrivi la domanda">${esc(q.text)}</textarea>
    <div class="row2"><div><label for="qType${i}">Tipo di risposta</label><select id="qType${i}" data-f="multiple"><option value="0" ${q.multiple ? '' : 'selected'}>Una sola risposta</option><option value="1" ${q.multiple ? 'selected' : ''}>Risposta multipla</option></select></div>
      <div ${q.multiple ? '' : 'class="hidden"'}><label for="qMax${i}">Massimo scelte</label><input id="qMax${i}" data-f="max" type="number" min="1" step="1" value="${q.max ?? ''}" placeholder="Nessun limite"></div></div>
    <label for="qOpts${i}">Opzioni · una per riga</label><textarea id="qOpts${i}" data-f="options" rows="${Math.max(3, q.options.length + 1)}" placeholder="Opzione 1&#10;Opzione 2&#10;Opzione 3">${esc(opts)}</textarea>
    <div class="optcount" id="qCount${i}">${countLabel(q)}</div></div>`;
}
const countLabel = (q) => `${q.options.length} ${q.options.length === 1 ? 'opzione' : 'opzioni'}`;
const parseOptions = (text) => text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

function autosize(el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; }

function bindEditor() {
  document.querySelectorAll('#editor textarea').forEach(t => { autosize(t); t.addEventListener('input', () => autosize(t)); });
  const markDirty = () => { dirty = true; $('edStatus').textContent = 'Modifiche non salvate'; };
  $('edTitle').oninput = (e) => {
    editing.name = e.target.value; markDirty();
    if (!editingSlug && !slugTouched) { editing.slug = slugify(e.target.value); $('edSlug').value = editing.slug; }
  };
  if (!editingSlug) $('edSlug').oninput = (e) => { slugTouched = true; editing.slug = e.target.value.trim(); markDirty(); };
  document.querySelectorAll('.qedit').forEach(box => {
    const i = Number(box.dataset.i), q = editing.questions[i];
    box.querySelector('[data-f="text"]').oninput = (e) => { q.text = e.target.value; markDirty(); };
    box.querySelector('[data-f="options"]').oninput = (e) => { q.options = parseOptions(e.target.value); $(`qCount${i}`).textContent = countLabel(q); markDirty(); };
    box.querySelector('[data-f="multiple"]').onchange = (e) => { q.multiple = e.target.value === '1'; if (!q.multiple) q.max = null; markDirty(); rerender(); };
    box.querySelector('[data-f="max"]').oninput = (e) => { const v = parseInt(e.target.value, 10); q.max = Number.isInteger(v) && v > 0 ? v : null; markDirty(); };
    box.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
      const qs = editing.questions, act = b.dataset.act;
      if (act === 'up' && i > 0) [qs[i - 1], qs[i]] = [qs[i], qs[i - 1]];
      if (act === 'down' && i < qs.length - 1) [qs[i + 1], qs[i]] = [qs[i], qs[i + 1]];
      if (act === 'dup') qs.splice(i + 1, 0, JSON.parse(JSON.stringify(q)));
      if (act === 'del' && qs.length > 1) { if ((q.text || q.options.length) && !confirm(`Eliminare la domanda ${i + 1}?`)) return; qs.splice(i, 1); }
      markDirty(); rerender();
    });
  });
  $('edAdd').onclick = () => { editing.questions.push(blankQuestion()); markDirty(); rerender(); const last = document.querySelector('.qedit:last-child textarea'); last?.focus(); };
  $('edSave').onclick = () => saveModel(false);
  if ($('edRevert')) $('edRevert').onclick = () => { if (confirm('Annullare le modifiche non salvate?')) openModel(editingSlug); };
  if (!isAdmin) document.querySelectorAll('#editor input, #editor textarea, #editor select, #editor button').forEach(x => x.disabled = true);
}
function rerender() { const status = $('edStatus')?.textContent; renderEditor(); if (status) $('edStatus').textContent = status; }

function validateEditing() {
  const name = editing.name.trim();
  if (!name) return 'Inserisci il titolo del sondaggio.';
  const slug = editingSlug || editing.slug;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) return 'Codice del link non valido: usa lettere minuscole, numeri e trattini.';
  if (!editingSlug && modelBySlug(slug)) return 'Questo codice è già usato da un altro modello.';
  for (const [i, q] of editing.questions.entries()) {
    if (!q.text.trim()) return `Scrivi il testo della domanda ${i + 1}.`;
    if (q.options.length < 2) return `La domanda ${i + 1} deve avere almeno 2 opzioni.`;
    if (q.options.length > 50) return `La domanda ${i + 1} ha più di 50 opzioni.`;
    if (new Set(q.options.map(o => o.toLowerCase())).size !== q.options.length) return `La domanda ${i + 1} ha opzioni ripetute.`;
    if (q.multiple && q.max && q.max > q.options.length) return `Domanda ${i + 1}: il massimo di scelte supera il numero di opzioni.`;
  }
  return null;
}

async function saveModel(force) {
  if (!isAdmin) return;
  const problem = validateEditing();
  if (problem) { $('edStatus').textContent = problem; return; }
  const slug = editingSlug || editing.slug;
  const questions = editing.questions.map(q => ({ text: q.text.trim(), multiple: q.multiple, max: q.multiple ? q.max : null, options: q.options }));
  $('edSave').disabled = true; $('edStatus').textContent = 'Salvataggio…';
  const { error } = await db.rpc('save_poll_model', { p_slug: slug, p_title: editing.name.trim(), p_questions: questions, p_force: force });
  $('edSave').disabled = false;
  if (error) {
    const code = errorCode(error);
    if (code === 'MODEL_HAS_VOTES') {
      if (confirm('Hai cambiato la struttura del sondaggio (domande, opzioni o tipo di risposta) e ci sono già voti.\n\nSalvando, i voti di tutte le sessioni di questo sondaggio vengono azzerati. Continuare?')) return saveModel(true);
      $('edStatus').textContent = 'Non salvato: i voti esistenti sono stati mantenuti.'; return;
    }
    $('edStatus').textContent = { INVALID_SLUG: 'Codice del link non valido.', INVALID_TITLE: 'Titolo mancante.', INVALID_MODEL: 'Controlla domande e opzioni (min 2, max 50, non ripetute).', NOT_ADMIN: 'Questo account non ha i permessi di gestione.' }[code] || 'Salvataggio non riuscito. Riprova.';
    return;
  }
  dirty = false; editingSlug = slug;
  toast(force ? 'Modello salvato, voti azzerati.' : 'Modello salvato.');
  await loadModels(); openModel(slug);
  if (force) loadSessions();
}

// --- Link e azioni del modello ------------------------------------------------

function renderModelSide() {
  const m = editingSlug && modelBySlug(editingSlug);
  $('modelActions').classList.toggle('hidden', !m);
  if (!m) { $('modelLinks').innerHTML = `<div class="empty">${editing ? 'I link compaiono dopo aver creato il modello.' : 'Seleziona un modello.'}</div>`; return; }
  const p = presenterUrl(m.slug), v = voteUrl(m.slug);
  $('modelLinks').innerHTML = `
    <div class="linkbox"><b>Pagina da proiettare</b><code>${esc(shortUrl(p))}</code><div class="btns"><button class="btn mini" data-copy="${esc(p)}">Copia</button><a class="btn mini" href="${esc(p)}" target="_blank" rel="noopener">Apri ↗</a></div></div>
    <div class="linkbox"><b>Link per votare</b><code>${esc(shortUrl(v))}</code><div class="btns"><button class="btn mini" data-copy="${esc(v)}">Copia</button><a class="btn mini" href="${esc(v)}" target="_blank" rel="noopener">Apri ↗</a><button class="btn mini" id="qrDownload">Scarica QR (PNG)</button></div></div>`;
  bindCopy($('modelLinks'));
  $('qrDownload').onclick = () => downloadQR(m);
  $('modelArchive').textContent = m.archived ? 'Rimetti nell’elenco' : 'Nascondi dall’elenco';
}

function bindCopy(root) {
  root.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copy(b.dataset.copy, 'Link copiato.'));
}
async function copy(text, okText) {
  try { await navigator.clipboard.writeText(text); toast(okText); }
  catch { prompt('Copia il testo:', text); }
}

async function downloadQR(m) {
  try {
    const url = await QRCode.toDataURL(voteUrl(m.slug), { width: 1200, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#080a20', light: '#ffffff' } });
    const a = document.createElement('a'); a.href = url; a.download = `QR_${m.slug}.png`; document.body.appendChild(a); a.click(); a.remove();
  } catch { toast('QR non generato.'); }
}

$('copyAll').onclick = () => {
  if (!models.length) return;
  const text = models.filter(m => !m.archived).map(m => `${m.name}\n  Pagina da proiettare: ${presenterUrl(m.slug)}\n  Link per votare: ${voteUrl(m.slug)}`).join('\n\n');
  copy(text, 'Link di tutti i sondaggi copiati.');
};

$('modelStart').onclick = async () => {
  const m = modelBySlug(editingSlug); if (!m || !isAdmin) return;
  if (dirty && !confirm('Ci sono modifiche non salvate: la votazione userà la versione salvata. Continuare?')) return;
  const { data, error } = await db.rpc('start_session', { p_slug: m.slug });
  if (error) { toast('Avvio non riuscito.'); return; }
  selectedSessionId = data; showTab('sessions'); await loadSessions(); toast('Votazione aperta.');
};

$('modelArchive').onclick = async () => {
  const m = modelBySlug(editingSlug); if (!m || !isAdmin) return;
  const { error } = await db.rpc('set_poll_archived', { p_slug: m.slug, p_archived: !m.archived });
  if (error) { toast('Operazione non riuscita.'); return; }
  toast(m.archived ? 'Modello rimesso nell’elenco.' : 'Modello nascosto: link e storico restano.'); await loadModels();
};

$('modelDelete').onclick = async () => {
  const m = modelBySlug(editingSlug); if (!m || !isAdmin) return;
  const n = sessions.filter(s => s.poll_slug === m.slug).length;
  const msg = n ? `Eliminare “${m.name}” insieme a ${n} ${n === 1 ? 'sessione' : 'sessioni'} e a tutti i voti?\nI link nella presentazione smetteranno di funzionare.\n\nPer confermare scrivi il codice: ${m.slug}` : null;
  if (n) { if (prompt(msg) !== m.slug) { toast('Eliminazione annullata.'); return; } }
  else if (!confirm(`Eliminare il modello “${m.name}”? I link nella presentazione smetteranno di funzionare.`)) return;
  const { error } = await db.rpc('delete_poll_model', { p_slug: m.slug });
  if (error) { toast('Eliminazione non riuscita.'); return; }
  dirty = false; editingSlug = null; editing = null;
  if (sessions.some(s => s.id === selectedSessionId && s.poll_slug === m.slug)) selectedSessionId = null;
  toast('Modello eliminato.'); await loadModels(); renderEditor(); renderModelSide(); await loadSessions();
};

// ==========================================================================
// Sessioni
// ==========================================================================

async function loadSessions() {
  const { data, error } = await db.from('poll_sessions').select('id,poll_slug,status,created_at,closed_at,round,participants,reset_at').order('created_at', { ascending: false });
  if (error) { toast('Sessioni non caricate: esegui database.sql (v3) in Supabase.'); return; }
  sessions = data || [];
  if (selectedSessionId && !sessions.some(s => s.id === selectedSessionId)) selectedSessionId = null;
  renderSessionList(); renderModelList();
  await renderSession();
}
const refreshSessions = throttled(loadSessions, 500);

function renderSessionList() {
  const filter = $('sessionFilter').value;
  const list = sessions.filter(s => !filter || s.poll_slug === filter);
  $('sessionNumber').textContent = list.length;
  $('sessionList').innerHTML = list.length ? list.map(s => {
    const m = modelBySlug(s.poll_slug);
    return `<button class="session ${s.id === selectedSessionId ? 'active' : ''}" data-id="${s.id}"><span class="status ${s.status === 'closed' ? 'closed' : ''}">${s.status === 'open' ? '● APERTA' : 'CHIUSA'}</span><strong>${esc(m?.name || s.poll_slug)}</strong><small>${new Date(s.created_at).toLocaleString('it-IT')} · ${s.participants} ${s.participants === 1 ? 'partecipante' : 'partecipanti'}</small></button>`;
  }).join('') : '<div class="empty">Nessuna sessione. Avviane una dal pannello a destra.</div>';
  document.querySelectorAll('.session').forEach(b => b.onclick = () => { selectedSessionId = b.dataset.id; renderSessionList(); renderSession(); });
}
$('sessionFilter').onchange = renderSessionList;

$('createSession').onclick = async () => {
  if (!isAdmin || !$('pollChoice').value) return;
  $('createSession').disabled = true;
  const { data, error } = await db.rpc('start_session', { p_slug: $('pollChoice').value });
  $('createSession').disabled = false;
  if (error) { toast('Avvio non riuscito.'); return; }
  selectedSessionId = data; await loadSessions(); toast('Votazione aperta. Il QR è pronto.');
};

function watchCounts(s) {
  const key = s ? `${s.id}-${s.round}` : null;
  if (countsChannel?.key === key) return;
  if (countsChannel) { db.removeChannel(countsChannel.ch); countsChannel = null; }
  if (!s || s.status !== 'open') return;
  const ch = db.channel(`manager-counts-${key}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'response_counts', filter: `session_id=eq.${s.id}` }, refreshView)
    .subscribe();
  countsChannel = { key, ch };
}
const refreshView = throttled(() => renderSession(), 800);

async function renderSession() {
  const s = sessions.find(x => x.id === selectedSessionId);
  watchCounts(s);
  if (!s) { $('sessionView').innerHTML = '<div class="empty">Seleziona una sessione nello storico o avviane una nuova.</div>'; renderQR(null); return; }
  const poll = modelBySlug(s.poll_slug);
  if (!poll) { $('sessionView').innerHTML = '<div class="empty">Il modello di questa sessione non esiste più.</div>'; renderQR(null); return; }
  let counts, participants = s.participants;
  try {
    const [c, fresh] = await Promise.all([loadCounts(poll, s.id), db.from('poll_sessions').select('participants').eq('id', s.id).maybeSingle()]);
    counts = c; participants = Number(fresh.data?.participants ?? participants);
  } catch { toast('Risultati non disponibili.'); return; }
  if (selectedSessionId !== s.id) return;
  const open = s.status === 'open';
  $('sessionView').innerHTML = `
    <div class="session-title"><div><h2>${esc(poll.name)}</h2><p>Avviata il ${new Date(s.created_at).toLocaleString('it-IT')} · codice ${s.id.slice(0, 8)}${s.closed_at ? ` · chiusa il ${new Date(s.closed_at).toLocaleString('it-IT')}` : ''}${s.reset_at ? ` · azzerata il ${new Date(s.reset_at).toLocaleString('it-IT')}` : ''}</p></div><span class="state ${open ? '' : 'closed'}">${open ? '● In corso' : 'Chiusa'}</span></div>
    <div class="stats"><div class="stat"><strong id="responsesTotal">${participants.toLocaleString('it-IT')}</strong><span>partecipanti</span></div><div class="stat"><strong>${String(poll.questions.length).padStart(2, '0')}</strong><span>domande</span></div></div>
    <div class="actions">${isAdmin ? `${open ? '<button class="btn" id="sClose">Chiudi votazione</button>' : ''}<button class="btn" id="sReset">Azzera e riapri</button><button class="btn danger" id="sDelete">Elimina sessione</button>` : ''}<a class="btn" href="${esc(presenterUrl(poll.slug))}" target="_blank" rel="noopener">Pagina da proiettare ↗</a></div>
    <div class="questions">${poll.questions.map((q, qi) => questionMarkup(q, qi, counts[qi], participants)).join('')}</div>`;
  $('sClose')?.addEventListener('click', () => sessionAction('close_session', s, 'Chiudere la votazione? Non saranno più accettati voti.', 'Votazione chiusa.'));
  $('sReset')?.addEventListener('click', () => sessionAction('reset_session', s, `Azzerare tutti i voti (${participants}) e riaprire la votazione?\nL’operazione non si può annullare.`, 'Voti azzerati, votazione riaperta.'));
  $('sDelete')?.addEventListener('click', () => sessionAction('delete_session', s, 'Eliminare questa sessione e i suoi voti dallo storico?\nL’operazione non si può annullare.', 'Sessione eliminata.'));
  renderQR(poll);
}

function questionMarkup(q, qi, values, participants) {
  return `<article class="qrow"><h3>${qi + 1}. ${esc(q.text)}${q.multiple ? `<span class="tagm">${esc(questionHint(q).toUpperCase())}</span>` : ''}</h3><div class="bars">${q.options.map((option, oi) => {
    const pct = percent(values[oi], participants);
    return `<div class="barrow"><span class="barlabel">${esc(option)}</span><span class="track"><span class="fill" style="display:block;width:${pct}%"></span></span><span class="pct">${pct}% · ${values[oi]}</span></div>`;
  }).join('')}</div></article>`;
}

async function sessionAction(fn, s, question, okText) {
  if (!confirm(question)) return;
  const { error } = await db.rpc(fn, { p_session_id: s.id });
  if (error) { toast('Operazione non riuscita.'); return; }
  if (fn === 'delete_session') selectedSessionId = null;
  toast(okText); await loadSessions();
}

async function renderQR(poll) {
  const area = $('qrArea');
  if (!poll) { area.innerHTML = '<span class="qr-placeholder">QR</span>'; $('qrHint').textContent = 'Seleziona una sessione per vedere il QR del suo sondaggio.'; $('clientLink').innerHTML = ''; return; }
  const url = voteUrl(poll.slug);
  $('qrHint').textContent = `Link fisso di “${poll.name}”.`;
  $('clientLink').innerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener" style="color:#83dcff">Apri pagina partecipante ↗</a> · <a href="#" id="copyVote" style="color:#83dcff">Copia link</a>`;
  $('copyVote').onclick = (e) => { e.preventDefault(); copy(url, 'Link copiato.'); };
  try {
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, url, { width: 134, margin: 1, color: { dark: '#080a20', light: '#ffffff' } });
    area.innerHTML = ''; area.appendChild(canvas);
  } catch { area.innerHTML = '<span class="qr-placeholder">QR non disponibile</span>'; }
}
