import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { POLLS } from './polls.js';

const $ = id => document.getElementById(id);
const configured = !SUPABASE_URL.includes('YOUR_PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR_');
const sessionId = new URLSearchParams(location.search).get('session');
let db, session, poll, step = 0, choices = [null,null,null], participantId, liveChannel, saving = false;
const draftKey = `conexa-draft-${sessionId}`, voteKey = `conexa-vote-${sessionId}`;

start();

async function start() {
  if (!configured) return fatal('Il sondaggio non è ancora configurato.');
  if (!sessionId) return fatal('Apri il link o inquadra il QR del sondaggio per partecipare.');
  db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await db.from('poll_sessions').select('id,poll_slug,status').eq('id', sessionId).single();
  if (error || !data) return fatal('Questa sessione non è disponibile. Chiedi all’organizzatore un nuovo QR code.');
  session = data; poll = POLLS.find(item => item.slug === session.poll_slug);
  if (!poll) return fatal('Non riconosco questo sondaggio.');
  $('headline').textContent = poll.name;
  $('lead').textContent = 'Partecipa al confronto. Puoi rivedere e cambiare le tue scelte prima di inviare.';
  $('progressTitle').textContent = poll.name.toUpperCase();
  participantId = localStorage.getItem(`conexa-participant-${sessionId}`);
  if (!participantId) { participantId = crypto.randomUUID(); localStorage.setItem(`conexa-participant-${sessionId}`, participantId); }
  const storedVote = safeParse(localStorage.getItem(voteKey));
  const storedDraft = safeParse(localStorage.getItem(draftKey));
  if (storedVote?.submitted) {
    choices = storedVote.answers;
    await showFinal(true);
  } else if (session.status === 'closed') {
    if (storedDraft?.length === 3) choices = storedDraft;
    await showFinal(false);
  } else {
    if (storedDraft?.length === 3) choices = storedDraft;
    renderQuestion();
  }
  liveChannel = db.channel(`client-${sessionId}`)
    .on('postgres_changes', { event:'*', schema:'public', table:'response_counts', filter:`session_id=eq.${sessionId}` }, loadResults)
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'poll_sessions', filter:`id=eq.${sessionId}` }, async payload => {
      session.status = payload.new.status;
      if (session.status === 'closed' && !$('report').classList.contains('hidden')) return;
      if (session.status === 'closed' && !$('questionCard').classList.contains('hidden')) {
        $('questionCard').classList.add('hidden'); $('progressBox').classList.add('hidden');
        $('headline').textContent = 'Sessione conclusa'; $('lead').textContent = 'Il sondaggio è stato chiuso dall’organizzatore. Ecco i risultati della sala.';
        await showFinal(false);
      }
    }).subscribe();
}

function renderQuestion() {
  const q = poll.questions[step];
  $('progressBox').classList.remove('hidden'); $('questionCard').classList.remove('hidden');
  $('thanks').classList.add('hidden'); $('report').classList.add('hidden');
  $('stepNum').textContent = String(step + 1).padStart(2,'0');
  $('progressFill').style.width = `${((step + 1) / 3) * 100}%`;
  $('questionTag').textContent = `DOMANDA ${String(step + 1).padStart(2,'0')}`;
  $('question').textContent = q[0];
  $('answers').innerHTML = q[1].map((answer,index) => `<button class="answer ${choices[step]===index?'chosen':''}" data-index="${index}"><span class="radio"></span><span>${escapeHtml(answer)}</span></button>`).join('');
  document.querySelectorAll('.answer').forEach(button => button.onclick = () => {
    choices[step] = Number(button.dataset.index); localStorage.setItem(draftKey, JSON.stringify(choices)); renderQuestion();
  });
  $('previous').disabled = step === 0;
  $('previous').onclick = () => { if (step > 0) { step--; renderQuestion(); } };
  $('continue').disabled = choices[step] === null || saving;
  $('continue').textContent = step === 2 ? (saving ? 'Invio…' : 'Invia votazione  ✓') : 'Continua  →';
  $('continue').onclick = step === 2 ? submitVote : () => { if (choices[step] !== null) { step++; renderQuestion(); } };
}

async function submitVote() {
  if (saving || choices.some(answer => !Number.isInteger(answer))) return;
  saving = true; renderQuestion();
  const { error } = await db.rpc('submit_vote', { p_session_id: sessionId, p_participant_id: participantId, p_answers: choices });
  saving = false;
  if (error) {
    const message = String(error.message || '').toLowerCase();
    if (message.includes('duplicate') || message.includes('unique')) {
      localStorage.setItem(voteKey, JSON.stringify({ submitted:true, answers:choices }));
      localStorage.removeItem(draftKey); await showFinal(true); return;
    }
    if (message.includes('closed')) { session.status='closed'; $('questionCard').classList.add('hidden'); $('progressBox').classList.add('hidden'); $('headline').textContent='Sessione conclusa'; $('lead').textContent='Il sondaggio è stato chiuso dall’organizzatore.'; await showFinal(false); return; }
    renderQuestion(); toast('Invio non riuscito. Controlla la connessione e riprova.'); return;
  }
  localStorage.setItem(voteKey, JSON.stringify({ submitted:true, answers:choices }));
  localStorage.removeItem(draftKey);
  await showFinal(true); confetti();
}

async function showFinal(received) {
  $('progressBox').classList.add('hidden'); $('questionCard').classList.add('hidden');
  $('thanks').classList.toggle('hidden', !received); $('report').classList.remove('hidden');
  if (!received) { $('headline').textContent='Risultati della sala'; $('lead').textContent='Ecco come ha risposto il pubblico.'; }
  $('privacy').textContent='Risultati aggregati · aggiornati in tempo reale';
  await loadResults();
}

async function loadResults() {
  if (!db || !poll) return;
  const { data, error } = await db.from('response_counts').select('question_index,option_index,vote_count').eq('session_id',sessionId);
  if (error) { $('reports').innerHTML='<p class="lead">Risultati temporaneamente non disponibili.</p>'; return; }
  const counts = poll.questions.map(q => q[1].map(() => 0));
  (data || []).forEach(row => { if (counts[row.question_index]?.[row.option_index] !== undefined) counts[row.question_index][row.option_index] = Number(row.vote_count); });
  $('reports').innerHTML = poll.questions.map((question,qIndex) => {
    const total = counts[qIndex].reduce((sum,n)=>sum+n,0);
    return `<section class="report-question"><div class="report-q-head"><span class="qtag">DOMANDA 0${qIndex+1}</span><span class="report-total"><strong>${total.toLocaleString('it-IT')}</strong> risposte</span></div><h4>${escapeHtml(question[0])}</h4><div class="results">${question[1].map((option,optionIndex)=>{
      const pct = total ? Math.round(counts[qIndex][optionIndex]/total*100) : 0;
      const mine = choices[qIndex] === optionIndex;
      return `<div class="result-row ${mine?'mine':''}"><div class="result-label">${escapeHtml(option)}${mine?'<span class="mine-tag">LA TUA</span>':''}</div><div class="result-track"><div class="result-fill" style="width:${pct}%"></div></div><div class="result-pct">${pct}%</div></div>`;
    }).join('')}</div></section>`;
  }).join('');
  $('updated').textContent = 'Aggiornato adesso';
}

function fatal(message) {
  $('progressBox').classList.add('hidden'); $('questionCard').classList.add('hidden');
  $('headline').textContent='Conexa · Sondaggi'; $('lead').textContent=message;
  $('privacy').textContent='Conexa 2026 · Hotel Systems';
}
function safeParse(value) { try { return JSON.parse(value); } catch { return null; } }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(message) { $('toast').textContent=message; $('toast').classList.add('show'); setTimeout(()=>$('toast').classList.remove('show'),2500); }
function confetti() {
  const colors=['#57d9ff','#ff456d','#8c64ff','#53e1b7','#f6bd54'];
  $('confetti').innerHTML=Array.from({length:40},(_,i)=>`<i style="left:${Math.random()*100}%;background:${colors[i%colors.length]};animation-delay:${Math.random()*.7}s"></i>`).join('');
  setTimeout(()=>$('confetti').innerHTML='',3500);
}
