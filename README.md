# Conexa Live

Sito statico per GitHub Pages, con Supabase come archivio condiviso. Non serve un server applicativo.

## Cosa fa

- `index.html`: gestione con accesso amministratore, avvio/chiusura sessioni, QR univoco, risultati live e storico.
- `client.html`: percorso da smartphone, tre domande, possibilità di cambiare le risposte prima dell’invio, conferma e report aggiornato in tempo reale.
- Dal pannello di gestione si creano nuovi modelli al momento: titolo e tre domande, con 2–10 opzioni per domanda. Il modello viene salvato e avviato subito con un QR dedicato. I modelli non più necessari si tolgono dall’elenco con **Togli questo modello dall’elenco**: sessioni e risultati restano nello storico.
- Le sessioni chiuse e i totali restano nel database. I voti inviati non sono modificabili né cancellabili dall’app.
- Le risposte grezze restano private; il pubblico legge soltanto i conteggi aggregati.

## Configurazione iniziale

1. Crea un progetto Supabase.
2. In **Authentication**, crea l’account amministratore. In **Authentication → Sign In / Providers** disattiva *Allow new users to sign up*.
3. Apri **SQL Editor**, incolla ed esegui tutto il contenuto di `database.sql`. Gli account già presenti in Authentication diventano amministratori.
4. Copia l’URL del progetto e la chiave **publishable** (oppure la vecchia chiave `anon`) da **Project Settings → API Keys** in `config.js`.
   - Non inserire mai `service_role` o una secret key in `config.js`.
5. Pubblica sul repository GitHub i file contenuti in questa cartella, nella radice del repository.
6. In GitHub apri **Settings → Pages**, scegli la pubblicazione dal branch `main`, cartella `/ (root)`, e salva.
7. Apri `https://<utente>.github.io/<repository>/` per la gestione. Il QR aprirà la pagina partecipante con l’ID della sessione.

## Aggiornamento da una versione precedente

`database.sql` si può rieseguire su un database esistente: aggiunge le colonne e le tabelle mancanti, aggiorna policy e funzioni e non cancella sessioni, voti o modelli. Non serve più lo script separato `database-update-custom-polls.sql`.

## Amministratori

Solo gli account presenti nella tabella `poll_admins` possono avviare e chiudere sessioni e creare o togliere modelli. Un account creato con la registrazione pubblica non ottiene questi permessi. Per aggiungere un amministratore dopo la prima installazione, crealo in Authentication e poi esegui:

```sql
insert into public.poll_admins(user_id)
select id from auth.users where email = 'nome@dominio.it';
```

Un account non autorizzato che entra nel pannello vede lo storico in sola lettura e un avviso.

## Regole dei voti

Le scelte restano sul dispositivo mentre il partecipante naviga tra le domande. Può tornare indietro e correggerle fino a **Invia votazione**. L’invio è una singola operazione atomica: o vengono registrate tutte e tre le risposte, o nessuna. Il database rifiuta un secondo invio con lo stesso identificativo partecipante e non concede al client permessi per aggiornare o eliminare voti.

Il browser conserva l’identificativo anonimo in `localStorage`. È pensato per un sondaggio rapido senza login; cancellare i dati del browser consente a una persona di ottenere un nuovo identificativo. Se in futuro serve garantire una sola votazione per persona, servirà associare i partecipanti a un’identità o a codici monouso.

I modelli personalizzati sono verificati anche dal database: tre domande, testo fino a 220 caratteri, 2–10 opzioni fino a 120 caratteri ciascuna.

## Prestazioni in sala

I telefoni che mostrano il report raggruppano gli aggiornamenti e rileggono i totali con un ritardo casuale di 0,8–2 secondi; il pannello di gestione al massimo ogni 0,8 secondi. Chi sta ancora rispondendo non riceve aggiornamenti finché non invia. Verifica nel piano Supabase il limite di connessioni realtime contemporanee rispetto al numero di partecipanti previsto.

Le librerie JavaScript (`@supabase/supabase-js` 2.117.3, `qrcode` 1.5.4) e i caratteri vengono caricati da CDN in versione fissa, quindi i visitatori devono avere accesso a Internet. GitHub Pages pubblica i file statici; Supabase conserva le risposte e fornisce le notifiche realtime.

## Storico

Chiudi una sessione dal pannello di gestione per archiviarla. La chiusura blocca nuovi invii; sessione, data e risultati aggregati restano visibili nell’elenco storico. Per un altro gruppo o momento avvia una nuova sessione: i dati precedenti non vengono sovrascritti.
