import { db, configured, $, esc, loadPoll, currentSession, loadCounts, percent, questionHint, toast, throttled, uuid } from './common.js';

// Due modi di aprire la pagina:
//   client.html?p=<slug>        link fisso del sondaggio (segue la sessione in corso)
//   client.html?session=<id>    link di una sessione precisa (QR delle versioni precedenti)
const params = new URLSearchParams(location.search);
const slugParam = params.get('p');
const sessionParam = params.get('session');

let poll = null, session = null, step = 0, choices = [], participantId = null, saving = false;
let view = 'none', countsChannel = null;

start();

async function start() {
  if (!configured) return fatal('Il sondaggio non è ancora configurato.');
  if (!slugParam && !sessionParam) return fatal('Apri il link o inquadra il QR del sondaggio per partecipare.');

  let first = null;
  if (sessionParam) {
    const { data } = await db.from('poll_sessions').select('id,poll_slug,status,created_at,closed_at,round,participants').eq('id', sessionParam).maybeSingle();
    if (!data) return fatal('Questa sessione non è disponibile. Inquadra di nuovo il QR in sala.');
    first = data;
  }
  const slug = slugParam || first.poll_slug;
  poll = await loadPoll(slug);
  if (!poll) return fatal('Non trovo questo sondaggio. Inquadra di nuovo il QR in sala.');
  showTitle();
  if (!first && slugParam) first = await currentSession(slug);
  apply(first);

  db.channel(`client-poll-${slug}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_sessions', filter: `poll_slug=eq.${slug}` }, refreshSession)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'poll_sessions' }, refreshSession)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'poll_catalog', filter: `slug=eq.${slug}` }, reloadPoll)
    .subscribe();

  // Riserva se il realtime cade (Wi-Fi di sala, telefono in standby): controllo ogni 12–18 s
  // e subito quando la pagina torna in primo piano.
  setInterval(refreshSession, 12000 + Math.random() * 6000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshSession(); reloadPoll(); } });
}

// --------------------------------------------------------------------------
// Sessione corrente
// --------------------------------------------------------------------------

const refreshSession = throttled(async () => {
  if (slugParam) return apply(await currentSession(poll.slug));
  const { data } = await db.from('poll_sessions').select('id,poll_slug,status,created_at,closed_at,round,participants').eq('id', sessionParam).maybeSingle();
  if (!data) return fatal('La sessione è stata eliminata dall’organizzatore.');
  apply(data);
}, 300, 500);

function apply(next) {
  if (!next) { session = null; stopCounts(); return showWaiting(); }
  const changed = !session || session.id !== next.id || session.round !== next.round;
  session = next;
  if (changed) {
    participantId = localStorage.getItem(`conexa-participant-${session.id}`);
    if (!participantId) { participantId = uuid(); localStorage.setItem(`conexa-participant-${session.id}`, participantId); }
    const draft = safeParse(localStorage.getItem(draftKey()));
    choices = validChoices(draft) ? draft : poll.questions.map(() => []);
    step = 0;
    watchCounts();
  }
  const voted = hasVoted();
  if (voted) { if (changed || view !== 'final') return showFinal(true); return scheduleResults(); }
  if (session.status === 'closed') { if (changed || view !== 'final') return showFinal(false); return scheduleResults(); }
  if (changed || view !== 'questions') renderQuestion();
}

const voteKey = () => `conexa-vote-${session.id}-${session.round}`;
const draftKey = () => `conexa-draft-${session.id}-${session.round}`;
function hasVoted() {
  const v = safeParse(localStorage.getItem(voteKey()));
  if (v?.submitted) { if (validChoices(v.answers)) choices = v.answers; return true; }
  // Voti inviati con la versione precedente (prima dell'azzeramento non esisteva il round).
  if (session.round === 0) {
    const old = safeParse(localStorage.getItem(`conexa-vote-${session.id}`));
    if (old?.submitted) { if (Array.isArray(old.answers)) choices = old.answers.map(a => Array.isArray(a) ? a : [a]); return true; }
  }
  return false;
}

function validChoices(list) {
  return Array.isArray(list) && list.length === poll.questions.length &&
    list.every((a, i) => Array.isArray(a) && a.every(v => Number.isInteger(v) && v >= 0 && v < poll.questions[i].options.length));
}

const reloadPoll = throttled(async () => {
  const fresh = await loadPoll(poll.slug);
  if (!fresh) return;
  poll = fresh; showTitle();
  if (!validChoices(choices)) { choices = poll.questions.map(() => []); step = 0; }
  if (view === 'questions') renderQuestion();
  else if (view === 'final') loadResults();
}, 300, 500);

function showTitle() {
  $('headline').textContent = poll.name;
  $('progressTitle').textContent = poll.name.toUpperCase();
  document.title = `${poll.name} · Conexa 2026`;
}

// --------------------------------------------------------------------------
// Viste
// --------------------------------------------------------------------------

function hideAll() {
  ['waiting', 'progressBox', 'questionCard', 'thanks', 'report'].forEach(id => $(id).classList.add('hidden'));
}

function showWaiting() {
  view = 'waiting'; hideAll();
  $('lead').textContent = 'Partecipa al confronto: le tue risposte contribuiscono alla fotografia della sala.';
  $('waiting').classList.remove('hidden');
}

function renderQuestion() {
  view = 'questions';
  const total = poll.questions.length, q = poll.questions[step], chosen = choices[step];
  ['waiting', 'thanks', 'report'].forEach(id => $(id).classList.add('hidden'));
  $('progressBox').classList.remove('hidden'); $('questionCard').classList.remove('hidden');
  $('lead').textContent = 'Puoi rivedere e cambiare le tue scelte prima di inviare.';
  $('stepNum').textContent = String(step + 1).padStart(2, '0');
  $('stepTotal').textContent = String(total).padStart(2, '0');
  $('progressFill').style.width = `${((step + 1) / total) * 100}%`;
  $('questionTag').textContent = `DOMANDA ${String(step + 1).padStart(2, '0')}`;
  $('questionType').textContent = q.multiple ? questionHint(q) : '';
  $('question').textContent = q.text;
  const full = q.multiple && q.max && chosen.length >= q.max;
  $('answers').innerHTML = q.options.map((answer, index) => {
    const on = chosen.includes(index);
    return `<button class="answer ${q.multiple ? 'multi' : ''} ${on ? 'chosen' : ''}" data-index="${index}" role="${q.multiple ? 'checkbox' : 'radio'}" aria-checked="${on}" ${full && !on ? 'disabled' : ''}><span class="radio"></span><span>${esc(answer)}</span></button>`;
  }).join('');
  document.querySelectorAll('.answer').forEach(button => button.onclick = () => pick(Number(button.dataset.index)));
  $('helper').textContent = q.multiple ? 'Seleziona una o più risposte. Puoi cambiarle fino all’invio.' : 'Puoi cambiare le risposte fino all’invio.';
  $('previous').disabled = step === 0;
  $('previous').onclick = () => { if (step > 0) { step--; renderQuestion(); } };
  const last = step === total - 1;
  $('continue').disabled = chosen.length === 0 || saving;
  $('continue').innerHTML = last ? (saving ? 'Invio…' : 'Invia votazione&nbsp; ✓') : 'Continua&nbsp; →';
  $('continue').onclick = last ? submitVote : () => { if (choices[step].length) { step++; renderQuestion(); } };
}

function pick(index) {
  const q = poll.questions[step];
  let list = choices[step];
  if (!q.multiple) list = [index];
  else if (list.includes(index)) list = list.filter(i => i !== index);
  else if (!q.max || list.length < q.max) list = [...list, index].sort((a, b) => a - b);
  choices[step] = list;
  localStorage.setItem(draftKey(), JSON.stringify(choices));
  renderQuestion();
}

async function submitVote() {
  if (saving || choices.some(a => !a.length)) return;
  saving = true; renderQuestion();
  const { error } = await db.rpc('submit_vote', { p_session_id: session.id, p_participant_id: participantId, p_answers: choices });
  saving = false;
  if (error) {
    const message = String(error.message || '').toLowerCase();
    if (message.includes('duplicate') || message.includes('unique')) return markVoted(false);
    if (message.includes('closed')) { session.status = 'closed'; return showFinal(false); }
    if (message.includes('invalid answer')) {
      await reloadPollNow();
      toast('Il sondaggio è stato aggiornato: controlla le risposte e invia di nuovo.'); return;
    }
    renderQuestion(); toast('Invio non riuscito. Controlla la connessione e riprova.'); return;
  }
  markVoted(true);
}

async function reloadPollNow() {
  const fresh = await loadPoll(poll.slug);
  if (fresh) { poll = fresh; showTitle(); }
  if (!validChoices(choices)) { choices = poll.questions.map(() => []); step = 0; }
  renderQuestion();
}

function markVoted(celebrate) {
  localStorage.setItem(voteKey(), JSON.stringify({ submitted: true, answers: choices }));
  localStorage.removeItem(draftKey());
  showFinal(true);
  if (celebrate) confetti();
}

async function showFinal(received) {
  view = 'final'; hideAll();
  $('thanks').classList.toggle('hidden', !received); $('report').classList.remove('hidden');
  if (received) $('lead').textContent = 'Grazie! Qui sotto vedi come sta rispondendo la sala.';
  else $('lead').textContent = 'La votazione è chiusa. Ecco come ha risposto la sala.';
  await loadResults();
}

// --------------------------------------------------------------------------
// Risultati live
// --------------------------------------------------------------------------

function watchCounts() {
  stopCounts();
  countsChannel = db.channel(`client-counts-${session.id}-${session.round}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'response_counts', filter: `session_id=eq.${session.id}` }, () => scheduleResults())
    .subscribe();
}
function stopCounts() { if (countsChannel) { db.removeChannel(countsChannel); countsChannel = null; } }

// Con tanti telefoni in sala ogni voto arriva a tutti: aggiornamenti raggruppati e
// distribuiti nel tempo (0,8–2 s). Chi sta ancora rispondendo non rilegge nulla.
const scheduleResults = throttled(() => view === 'final' ? loadResults() : null, 800, 1200);

async function loadResults() {
  if (!session || !poll) return;
  let counts, participants;
  try {
    const [c, s] = await Promise.all([
      loadCounts(poll, session.id),
      db.from('poll_sessions').select('participants').eq('id', session.id).maybeSingle()
    ]);
    counts = c; participants = Number(s.data?.participants ?? session.participants ?? 0);
  } catch { $('reports').innerHTML = '<p class="lead">Risultati non disponibili al momento: riprova tra poco.</p>'; return; }
  $('reportSub').textContent = `${participants.toLocaleString('it-IT')} ${participants === 1 ? 'partecipante' : 'partecipanti'} · risultati in tempo reale`;
  $('reports').innerHTML = poll.questions.map((q, qi) => {
    const mineList = Array.isArray(choices[qi]) ? choices[qi] : [];
    return `<section class="report-question"><div class="report-q-head"><span class="qtag">DOMANDA ${String(qi + 1).padStart(2, '0')}${q.multiple ? '<span class="multi-tag">PIÙ SCELTE</span>' : ''}</span><span class="report-total"><strong>${participants.toLocaleString('it-IT')}</strong> risposte</span></div><h4>${esc(q.text)}</h4><div class="results">${q.options.map((option, oi) => {
      const pct = percent(counts[qi][oi], participants);
      const mine = mineList.includes(oi);
      return `<div class="result-row ${mine ? 'mine' : ''}"><div class="result-label">${esc(option)}${mine ? '<span class="mine-tag">LA TUA</span>' : ''}</div><div class="result-track"><div class="result-fill" style="width:${pct}%"></div></div><div class="result-pct">${pct}%</div></div>`;
    }).join('')}</div></section>`;
  }).join('');
  $('updated').textContent = `Aggiornato alle ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

// --------------------------------------------------------------------------

function fatal(message) {
  view = 'fatal'; hideAll();
  $('headline').textContent = 'Conexa · Sondaggi'; $('lead').textContent = message;
}
function safeParse(value) { try { return JSON.parse(value); } catch { return null; } }
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#57d9ff', '#ff456d', '#8c64ff', '#53e1b7', '#f6bd54'];
  $('confetti').innerHTML = Array.from({ length: 40 }, (_, i) => `<i style="left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${Math.random() * .7}s"></i>`).join('');
  setTimeout(() => $('confetti').innerHTML = '', 3500);
}
