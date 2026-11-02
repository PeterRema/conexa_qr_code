# Conexa Live

Sito statico per GitHub Pages, con Supabase come archivio condiviso. Non serve un server applicativo.

## Cosa fa

- `index.html`: gestione con accesso amministratore, avvio/chiusura sessioni, QR univoco, risultati live e storico.
- `client.html`: percorso da smartphone, tre domande, possibilità di cambiare le risposte prima dell’invio, conferma e report aggiornato in tempo reale.
- Le sessioni chiuse e i totali restano nel database. I voti inviati non sono modificabili né cancellabili dall’app.
- Le risposte grezze restano private; il pubblico legge soltanto i conteggi aggregati.

## Configurazione iniziale

1. Crea un progetto Supabase.
2. Apri **SQL Editor**, incolla ed esegui tutto il contenuto di `database.sql`.
3. In **Authentication**, crea l’account amministratore. Lascia disabilitata la registrazione pubblica: l’accesso alla gestione è riservato agli account creati dall’organizzatore.
4. Copia l’URL del progetto e la chiave **publishable** (oppure la vecchia chiave `anon`) da **Project Settings → API Keys** in `config.js`.
   - Non inserire mai `service_role` o una secret key in `config.js`.
5. Pubblica sul repository GitHub i file contenuti in questa cartella, nella radice del repository.
6. In GitHub apri **Settings → Pages**, scegli la pubblicazione dal branch `main`, cartella `/ (root)`, e salva.
7. Apri `https://<utente>.github.io/<repository>/` per la gestione. Il QR aprirà la pagina partecipante con l’ID della sessione.

Le librerie JavaScript e i caratteri vengono caricati da CDN, quindi i visitatori devono avere accesso a Internet. GitHub Pages pubblica i file statici; Supabase conserva le risposte e fornisce le notifiche realtime.

## Regole dei voti

Le scelte restano sul dispositivo mentre il partecipante naviga tra le domande. Può tornare indietro e correggerle fino a **Invia votazione**. L’invio è una singola operazione atomica: o vengono registrate tutte e tre le risposte, o nessuna. Il database rifiuta un secondo invio con lo stesso identificativo partecipante e non concede al client permessi per aggiornare o eliminare voti.

Il browser conserva l’identificativo anonimo in `localStorage`. È pensato per un sondaggio rapido senza login; cancellare i dati del browser consente a una persona di ottenere un nuovo identificativo. Se in futuro serve garantire una sola votazione per persona, servirà associare i partecipanti a un’identità o a codici monouso.

## Storico

Chiudi una sessione dal pannello di gestione per archiviarla. La chiusura blocca nuovi invii; sessione, data e risultati aggregati restano visibili nell’elenco storico. Per un altro gruppo o momento avvia una nuova sessione: i dati precedenti non vengono sovrascritti.
