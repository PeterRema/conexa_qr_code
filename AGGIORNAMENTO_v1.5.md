# Conexa Hotel – aggiornamento v1.5: arredamento completo

Copiare il contenuto di questa cartella sopra `CONEXA 2026\WebTwin_Conexa\WebTwin_Conexa`, sovrascrivendo i file. Poi commit e push su GitHub: Render ricostruisce da solo.

Il pacchetto parte dalla versione attuale con Conexa Room: `app.js` mantiene i parametri `?camera=`, `?demo=1`, `?ora=`, il pannello clima/sveglia/musica/porta e i messaggi dalla pagina `room.html`. `server.js`, `room.*`, `index.html`, `style.css` e i modelli GLB non vengono toccati.

| File | Modifica |
|---|---|
| web/arredi.js | nuovo: arredi generati da codice per camere e spazi comuni |
| web/config/arredi_camere.json | nuovo: per ogni camera lato corridoio, bagno e tipologia (ricavati dai muri di interni.glb) |
| web/look.js | materiali degli arredi; pareti, porte e arredi ricevono la luce del proprio ambiente dal KNX; LED d'arredo accesi dal livello dei circuiti |
| web/app.js | carica gli arredi nel livello Interni; elimina i volumi luminosi provvisori del render (interni camere, fondo hall, loggia, divani e reception provvisori); bagliori e pozze più contenuti negli interni |

## Cosa contiene
- Stile "tech caldo": noce scuro, bronzo, cuoio cognac, velluto verde petrolio, marmo, pietra scura, LED 2700 K.
- 30 camere arredate una per una sul proprio taglio, in 3 tipologie:
  - Standard (10): letto 160, testata in noce con filo bronzo e LED, comodini sospesi con lampade, consolle con TV, armadio, tende, bagno con doccia filo pavimento, lavabo sospeso, specchio retroilluminato, vaso sospeso.
  - Superior (14): letto 180, poltrona con tavolino, sedia alla consolle.
  - Junior suite (6: 114, 115, 206, 207, 214, 215): letto 200, due poltrone in velluto, panca in cuoio ai piedi del letto.
- Piano terra open space: reception in noce cannettato con parete a listelli e logo retroilluminato, salotto in hall, bar ad isola con retrobanco luminoso come quinta verso il ristorante, ristorante con tavoli da 4, tavolo conviviale, panca con tavoli da 2 e cantina vini; controsoffitto caldo con gola LED. Cucina, bagni pubblici, back office, piscina interna con lettini, spogliatoi, sauna, relax.
- P1: lounge, loggia e terrazza arredate, office. P2: sala colazioni con buffet, galleria.
- Pavimenti: parquet (camere, ristorante, colazioni), resina (hall e bar), moquette con LED a battiscopa (corridoi), gres (bagni e servizi), pietra (piscina), deck (loggia e terrazza).

## Come funziona
- Gli arredi stanno nel livello **Interni**: si spengono con la sua spunta e vengono tagliati dal taglio di piano come i muri.
- Sono uniti per materiale (un oggetto per materiale), quindi il peso sul sito resta basso.
- Le luci degli arredi seguono lo stato KNX dell'ambiente: "Benvenuto" su una camera accende testata, comodini, consolle e la luce sulle pareti di quella camera.
- Per cambiare un materiale: tabella `TAB` in `look.js` (voci `ar_*`). Per cambiare una tipologia o una disposizione: `arredi.js` (sezione camere o spazio comune).

## v1.5.1 – correzione luci delle camere
Prima ogni camera si illuminava tutta insieme con la media dei suoi circuiti: il circuito bagno accendeva le luci vicino al letto e il bagno restava buio. Ora:
- **Generale (GEN):** luce diffusa della zona notte e gola LED a soffitto; non entra nel bagno.
- **Lettura (LET):** applique e LED della testata. La testata è sulla parete dove il progetto KNX ha le luci di lettura, e le applique stanno esattamente nelle loro posizioni.
- **Bagno (BAG):** solo il bagno (pavimento, sanitari, LED dello specchio).
- **Cortesia (COR):** LED a pavimento sotto letto, comodini, consolle e armadio.
Negli spazi comuni ogni apparecchio illumina il proprio ambiente in base alla distanza.

## v1.5.2 – collegamento a Conexa Room
Nella scheda di ogni camera (sotto le scene Benvenuto / Lettura / Notte / Spegni) c'è il pulsante **Apri Conexa Room · camera NNN**: apre `room.html?camera=NNN` in una nuova scheda, con lo stesso scenario giorno/sera/notte del gemello. Non compare negli spazi comuni, negli esterni e quando il gemello è incorporato dentro Conexa Room (`?demo=1`). L'accesso segue le regole di Conexa Room: con l'accesso amministratore fatto sul gemello il token vale anche lì; un ospite usa il link con la sua chiave camera.
