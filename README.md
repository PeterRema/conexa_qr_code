# Conexa Live (v3)

Sito statico per GitHub Pages, con Supabase come archivio condiviso. Non serve un server applicativo.

## Pagine

| Pagina | A cosa serve |
|---|---|
| `index.html` | Gestione (accesso amministratore): modelli, link fissi, votazioni, risultati e storico. |
| `sondaggio.html?p=<codice>` | **Pagina fissa da proiettare** per ogni sondaggio: QR grande, stato della votazione, partecipanti e risultati live. Con l’accesso admin nello stesso browser mostra i comandi Avvia, Chiudi e Azzera. |
| `client.html?p=<codice>` | **Link fisso per votare** (è quello del QR). Porta sempre alla votazione in corso di quel sondaggio; se non è ancora iniziata mostra un’attesa e passa alle domande da sola. |
| `client.html?session=<id>` | Link di una sessione precisa (compatibilità con i QR delle versioni precedenti). |
| `live.html` | Presentazione Canva con il sondaggio in sovrimpressione. |

I link con `?p=<codice>` non cambiano mai, anche quando avvii nuove votazioni o azzeri i voti: si possono inserire una volta per tutte nella presentazione. Nella scheda **Modelli e link** ci sono i pulsanti Copia, Scarica QR (PNG) e **Copia tutti i link**.

## Modelli

- Numero di domande libero (da 1 a 100), riordinabili, duplicabili ed eliminabili.
- Per ogni domanda: **una sola risposta** oppure **risposta multipla**, con un massimo di scelte facoltativo.
- Da 2 a 50 opzioni per domanda, una per riga, senza limiti di lunghezza dei testi.
- Il codice del link si sceglie alla creazione (lettere minuscole, numeri, trattini) e poi resta fisso.
- I testi si possono correggere anche dopo la votazione: i telefoni collegati vedono subito la correzione. Se si cambia la struttura (numero di domande o di opzioni, tipo di risposta) e ci sono già voti, il pannello chiede conferma e azzera i voti di quel sondaggio.
- **Nascondi dall’elenco** toglie il modello dal menu di avvio lasciando link e storico. **Elimina modello** cancella modello, sessioni e voti: se ci sono sessioni bisogna riscrivere il codice per confermare.

I 7 sondaggi della presentazione, prima in `polls.js`, ora sono nel database e si modificano dal pannello. `polls.js` non serve più e si può cancellare dal repository.

## Votazioni

- **Avvia votazione** apre una nuova sessione; un’eventuale sessione già aperta dello stesso sondaggio viene chiusa e resta nello storico.
- **Chiudi votazione** blocca nuovi voti; chi apre il link vede i risultati finali.
- **Azzera e riapri** cancella i voti della sessione e la riapre: i telefoni tornano alla prima domanda e tutti possono rivotare.
- **Elimina sessione** la toglie dallo storico con i suoi voti.

Con la risposta multipla le percentuali sono calcolate sui partecipanti, quindi la somma di una domanda può superare il 100%.

## Installazione o aggiornamento

1. In Supabase, **Authentication**: crea l’account amministratore e disattiva *Allow new users to sign up*.
2. **SQL Editor**: incolla ed esegui tutto `database.sql`. Lo script è rieseguibile e aggiorna anche un database v1/v2 senza perdere sessioni, voti o modelli (i voti vecchi vengono convertiti). Gli account già presenti in Authentication diventano amministratori.
3. In `config.js` URL del progetto e chiave **publishable** (mai `service_role`).
4. Carica nel repository GitHub tutti i file di questa cartella, nella radice.
5. **Settings → Pages**: branch `main`, cartella `/ (root)`.

Per aggiungere un amministratore dopo l’installazione, crealo in Authentication e poi esegui:

```sql
insert into public.poll_admins(user_id)
select id from auth.users where email = 'nome@dominio.it';
```

## Sicurezza

Il pubblico legge solo modelli, sessioni e totali aggregati; l’unica scrittura possibile è l’invio del voto, verificato dal database (sessione aperta, numero di risposte, opzioni valide, scelta singola o multipla, massimo di scelte, nessun doppio invio dallo stesso dispositivo). Tutte le operazioni di gestione passano da funzioni che controllano la tabella `poll_admins`.

L’identificativo anonimo del partecipante resta nel `localStorage` del telefono: chi cancella i dati del browser può votare di nuovo. Per garantire un solo voto a persona servirebbero codici monouso o un accesso.

## In sala

Gli aggiornamenti arrivano in tempo reale. Se il realtime cade (Wi-Fi di sala, telefono in standby) le pagine si riallineano da sole: i telefoni ogni 12–18 secondi e appena tornano in primo piano, la pagina da proiettare ogni 5 secondi, la gestione ogni 10. Nella pagina da proiettare il tasto **R** nasconde o mostra i risultati e **F** attiva lo schermo intero.

Le librerie (`@supabase/supabase-js` 2.117.3, `qrcode` 1.5.4) e i caratteri arrivano da CDN in versione fissa, quindi serve accesso a Internet. Verifica nel piano Supabase il limite di connessioni realtime contemporanee rispetto ai partecipanti previsti.
