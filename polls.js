export const POLLS = [
  { name:'Apertura · Da dove partiamo?', slug:'inizio', questions:[
    ['Hotel nuovo da 30 camere con SPA, piscina e palestra: da quale impianto partiamo?',['Termica','Domotica','Networking','Sicurezza']],
    ['Chi siete?',['Progettista o ingegnere','Installatore','System integrator','Committente o gestore','Altro']],
    ['Nel vostro ultimo progetto alberghiero, quanti impianti dialogavano davvero con la supervisione?',['Nessuno','1–2','3–4','Tutti']] ]},
  { name:'Comfort termico · ABB', slug:'comfort-abb', questions:[
    ['Qual è la criticità termica più difficile in un hotel con SPA e piscina?',['Deumidificazione piscina','Camere non occupate','Picchi ACS di SPA e palestra','Bilanciamento aree comuni']],
    ['Regolazione in camera: cosa preferite?',['Termostato autonomo','Controller di camera integrato nel BMS','Gestione dalla reception o dal PMS']],
    ['Un BACS in classe B (UNI EN ISO 52120-1) per un hotel nuovo è…',['Un obbligo da rispettare','Un investimento che si ripaga','Un costo difficile da far accettare']] ]},
  { name:'Controllo e gestione · MDT Italia', slug:'gestione-mdt', questions:[
    ['Rilevazione presenza in camera: quale soluzione vi convince di più?',['Tasca porta o keycard','Sensore radar o PIR','Keycard + sensore','Stato check-in dal PMS']],
    ['Quanto risparmio energetico vi aspettate dalla gestione camera basata sulla presenza?',['Meno del 10%','10–20%','20–30%','Oltre il 30%']],
    ['AI nel building: cosa vi serve di più?',['Manutenzione predittiva','Ottimizzazione energetica','Analisi abitudini ospiti','Non mi fido ancora']] ]},
  { name:'Connettività · Qubix', slug:'connettivita-qubix', questions:[
    ['Rete impianti e rete ospiti: come le realizzate?',['Reti fisicamente separate','Stessa infrastruttura con VLAN','Dipende dal budget']],
    ['Per un hotel da 30 camere: GPON o rame?',['GPON','Rame Cat6A','Soluzione ibrida','Non ho esperienza GPON']],
    ['Dopo la consegna, chi è responsabile della cybersecurity della rete impianti?',['Installatore o integratore','IT del cliente','Fornitore esterno','Nessuno di preciso']] ]},
  { name:'Luci di emergenza · Linergy', slug:'emergenza-linergy', questions:[
    ['Illuminazione di emergenza: autonoma o centralizzata?',['Apparecchi autonomi','Sistema centralizzato','Dipende dall’edificio']],
    ['Come gestite le verifiche periodiche (UNI 11222)?',['A mano con registro','Autodiagnosi locale','Supervisione centralizzata con report']],
    ['Segnaletica di esodo dinamica, che cambia direzione in base all’incendio: l’avete mai installata?',['Sì','No, ma la valuterei','No, troppo complessa']] ]},
  { name:'Termocamere AI · Dahua', slug:'termocamere-dahua', questions:[
    ['Termocamera AI per la prevenzione incendi: dove la mettete per prima?',['Centrale termica e locali tecnici','Cucina e lavanderia','Sauna e SPA','Parcheggio e ricarica auto']],
    ['Chi deve ricevere l’allarme della termocamera?',['Centrale rivelazione incendio','Supervisione o BMS','Reception via app','Tutti']],
    ['Una termocamera può sostituire la rivelazione incendio tradizionale?',['Sì','No, è complementare','Solo in alcuni ambienti']] ]},
  { name:'Vigili del Fuoco', slug:'vvf', questions:[
    ['Un hotel da 30 camere è attività soggetta ai controlli VVF?',['Sì','No','Dipende dai posti letto']],
    ['Le strutture ricettive si progettano più spesso con…',['Codice di prevenzione incendi (RTV V.5)','Regola tecnica tradizionale','Dipende dal progetto']],
    ['Il punto più critico tra impianti di sicurezza e building automation?',['Responsabilità','Certificazione','Manutenzione','Interfacciamento tecnico']] ]}
];
