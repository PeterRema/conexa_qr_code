import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configured = !SUPABASE_URL.includes('YOUR_PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR_');
export const db = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
export const $ = (id) => document.getElementById(id);

export function esc(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Formato unico dei modelli: { slug, name, archived, position, questions:[{ text, multiple, max, options[] }] }
export function toPoll(row) {
  if (!row?.title || !Array.isArray(row.questions)) return null;
  return {
    slug: row.slug,
    name: row.title,
    archived: !!row.archived,
    position: row.position ?? 0,
    questions: row.questions.map(q => ({
      text: String(q.text ?? ''),
      multiple: !!q.multiple,
      max: q.multiple && Number.isInteger(q.max) ? q.max : null,
      options: (q.options || []).map(String)
    }))
  };
}

export async function loadPoll(slug) {
  const { data } = await db.from('poll_catalog').select('slug,title,questions,archived,position').eq('slug', slug).maybeSingle();
  return toPoll(data);
}

// Link fissi: non cambiano mai, anche se si avviano nuove sessioni o si azzera.
const base = () => new URL('./', location.href);
export const voteUrl = (slug) => { const u = new URL('client.html', base()); u.searchParams.set('p', slug); return u.href; };
export const presenterUrl = (slug) => { const u = new URL('sondaggio.html', base()); u.searchParams.set('p', slug); return u.href; };
export const sessionUrl = (id) => { const u = new URL('client.html', base()); u.searchParams.set('session', id); return u.href; };
export const shortUrl = (href) => href.replace(/^https?:\/\//, '');

// Sessione “corrente” di un sondaggio: l’ultima aperta, altrimenti l’ultima chiusa.
export async function currentSession(slug) {
  const { data } = await db.from('poll_sessions')
    .select('id,poll_slug,status,created_at,closed_at,round,participants')
    .eq('poll_slug', slug).order('created_at', { ascending: false }).limit(20);
  const list = data || [];
  return list.find(s => s.status === 'open') || list[0] || null;
}

// Conteggi per domanda/opzione: counts[q][o]
export async function loadCounts(poll, sessionId) {
  const counts = poll.questions.map(q => q.options.map(() => 0));
  const { data, error } = await db.from('response_counts').select('question_index,option_index,vote_count').eq('session_id', sessionId);
  if (error) throw error;
  (data || []).forEach(r => { if (counts[r.question_index]?.[r.option_index] !== undefined) counts[r.question_index][r.option_index] = Number(r.vote_count); });
  return counts;
}

// Percentuale sui partecipanti: con la scelta multipla la somma può superare 100%.
export function percent(value, participants) {
  return participants > 0 ? Math.round(value / participants * 100) : 0;
}

export function questionHint(q) {
  if (!q.multiple) return 'Una risposta';
  return q.max ? `Fino a ${q.max} risposte` : 'Più risposte possibili';
}

export function slugify(text) {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '');
}

export function errorCode(error) {
  const m = String(error?.message || '');
  return (m.match(/NOT_ADMIN|INVALID_SLUG|INVALID_TITLE|INVALID_MODEL|MODEL_HAS_VOTES|POLL_NOT_FOUND|SESSION_NOT_FOUND|duplicate|Session is closed|Invalid answer/) || [m])[0];
}

let toastTimer;
export function toast(text) {
  const el = $('toast'); if (!el) return;
  el.textContent = text; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// Raggruppa gli aggiornamenti realtime: al massimo una lettura ogni `ms` (+ ritardo casuale).
export function throttled(fn, ms = 800, jitter = 0) {
  let timer = null;
  return () => {
    if (timer) return;
    timer = setTimeout(async () => { timer = null; await fn(); }, ms + Math.random() * jitter);
  };
}

// UUID anche dove crypto.randomUUID non esiste (browser vecchi o pagine non https).
export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
