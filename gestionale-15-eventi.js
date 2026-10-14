'use strict';
/* -------------------- 5) EVENTI + INIT -------------------- */
function h(id) { return document.getElementById(id); }

function chiudiModal() { h('modalRoot').innerHTML = ''; }

/* Task #188 (Matteo: "se clicco fuori perdo tutti i dati inseriti, per esempio per inserire un
   cliente ci vuole un po di tempo ed è snervante") - prima di chiudere un modal per click sul
   fondo scuro o con Esc (le due vie "accidentali": un click o un tasto premuto per sbaglio),
   confrontiamo lo stato dei campi del modal con quello al momento dell'apertura - se qualcosa è
   stato scritto o modificato chiediamo conferma invece di buttare via tutto in silenzio. I
   pulsanti espliciti "Annulla"/✕ restano invece immediati: sono una scelta consapevole, non un
   click a vuoto.
   MODAL_SNAPSHOT viene aggiornato da un MutationObserver su #modalRoot (vedi init), così funziona
   per tutti i ~35 punti del codice che aprono un modal senza dover toccare ciascuno di essi.
   L'input di ricerca globale (#ricercaInput) è escluso apposta: lì Esc deve chiudere subito,
   altrimenti basterebbe aver digitato una lettera per far comparire una conferma inutile. */
let MODAL_SNAPSHOT = null;
function serializzaModal() {
  const root = h('modalRoot');
  if (!root || !root.children.length) return null;
  const campi = root.querySelectorAll('input, textarea, select');
  const parti = [];
  campi.forEach((el, i) => {
    if (el.id === 'ricercaInput') return;
    const chiave = el.id || el.name || ('campo' + i);
    const valore = (el.type === 'checkbox' || el.type === 'radio') ? (el.checked ? '1' : '0') : el.value;
    parti.push(chiave + '=' + valore);
  });
  root.querySelectorAll('.doc-editor').forEach((ed, i) => parti.push('doc' + i + '=' + editorDocumentoToTesto(ed)));
  return parti.join('|');
}
function modalHaDatiNonSalvati() {
  if (MODAL_SNAPSHOT === null) return false;
  return serializzaModal() !== MODAL_SNAPSHOT;
}
function chiediPrimaDiChiudereModal() {
  // Selezione utente obbligatoria (nessun operatore scelto): non si chiude con un click fuori ne' con Esc.
  if (h('modalRoot') && h('modalRoot').querySelector('[data-obbligatorio]')) return;
  if (!modalHaDatiNonSalvati()) { chiudiModal(); return; }
  mostraConfermaChiusuraModal();
}
// Matteo (dopo aver segnalato che sulla scheda Nuovo cliente "non si riusciva più a scrivere"):
// il window.confirm() nativo usato qui prima ruba il focus del SISTEMA OPERATIVO (non solo della
// pagina) per mostrare il suo dialog - alla chiusura il focus non torna da solo dentro al campo di
// testo che si stava compilando, quindi il modulo sembra "bloccato" finché non si riclicca dentro
// al campo (la tastiera in realtà funzionava sempre, il cursore era solo altrove). In più,
// window.confirm() ha il font di sistema, non quello di Prisma ("possiamo darle un font grafico in
// linea con l'app?"). Questo overlay sostituisce il confirm nativo SOLO per questa conferma
// specifica (chiusura modal con dati non salvati): è un <div> su document.body, fuori da
// #modalRoot apposta, così non tocca mai il modal/il campo sottostante - nessun furto di focus,
// nessuna perdita di stato, il modulo resta esattamente com'era se si sceglie di continuare.
function mostraConfermaChiusuraModal() {
  if (h('confermaChiusuraOverlay')) return; // già aperto, non raddoppiare
  const div = document.createElement('div');
  div.id = 'confermaChiusuraOverlay';
  div.className = 'conferma-chiusura-overlay';
  div.innerHTML = `<div class="conferma-chiusura-box">
    <div class="conferma-chiusura-testo">Hai inserito dei dati in questo modulo: chiudere comunque senza salvare?</div>
    <div class="conferma-chiusura-azioni">
      <button type="button" class="btn" data-action="conferma-chiusura-annulla">Continua a modificare</button>
      <button type="button" class="btn danger" data-action="conferma-chiusura-conferma">Chiudi senza salvare</button>
    </div>
  </div>`;
  document.body.appendChild(div);
  // Il focus va sul pulsante "sicuro" (continua a modificare): Invio/Spazio per sbaglio non perde
  // dati, serve un click/Tab esplicito sull'altro pulsante per buttare via quanto scritto.
  const btnAnnulla = div.querySelector('[data-action="conferma-chiusura-annulla"]');
  if (btnAnnulla) btnAnnulla.focus();
}
function chiudiConfermaChiusuraModal() {
  const el = h('confermaChiusuraOverlay');
  if (el) el.remove();
}

function onClickDelegato(e) {
  const prev = CONFERMA_CTX;
  CONFERMA_CTX = { replay: () => onClickDelegato(e) };
  try { return onClickDelegatoInterno(e); } finally { CONFERMA_CTX = prev; }
}
function onClickDelegatoInterno(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  /* Trascinare il mouse per selezionare del testo dentro una riga/card cliccabile (es. per copiare un
     codice fiscale dall'elenco clienti) NON deve aprire la scheda: il click di fine trascinamento
     arriva comunque all'elemento. Con testo selezionato dentro l'elemento, il click si ignora
     (pulsanti e campi restano sempre cliccabili). */
  if (!/^(BUTTON|A|INPUT|SELECT|TEXTAREA|LABEL)$/.test(el.tagName) && !e.target.closest('button, a, input, select, textarea, label')) {
    try {
      const sel = window.getSelection && window.getSelection();
      if (sel && !sel.isCollapsed && String(sel).trim() && el.contains(sel.anchorNode)) return;
    } catch (err) { /* nessuna selezione: si prosegue */ }
  }
  const action = el.dataset.action;
  const id = el.dataset.id;

  switch (action) {
    case 'conferma-prisma-ok': chiudiConfermaPrisma(true); break;
    case 'conferma-prisma-annulla': chiudiConfermaPrisma(false); break;
    case 'nav-toggle-gruppo': toggleNavGruppo(el.dataset.gruppo); renderNav(); break;
    case 'import-cli-conferma': confermaWizardImportClienti(); break;
    case 'nuovo-incasso': modalIncasso(null); break;
    case 'riconc-conferma': if (RICONC) confermaRiconciliazione(); break;
    case 'modifica-incasso': modalIncasso(id); break;
    case 'incasso-registra-apri': modalRegistraIncasso(id); break;
    case 'salva-incasso': {
      const dati = { clienteId: h('incCliente').value, descrizione: h('incDescrizione').value.trim(), numero: h('incNumero').value.trim(), importo: Number(h('incImporto').value), dataEmissione: h('incEmissione').value, dataScadenza: h('incScadenza').value, note: h('incNote').value.trim() };
      if (!dati.clienteId || !(dati.importo > 0)) { toast('Scegli il cliente e indica un importo maggiore di zero.'); return; }
      if (id) aggiornaIncasso(id, dati); else aggiungiIncasso(dati);
      chiudiModal(); render(); toast(id ? 'Incasso aggiornato.' : 'Incasso registrato.');
      break;
    }
    case 'incasso-registra': {
      try { registraPagamentoIncasso(id, Number(h('incPagImporto').value), h('incPagData').value || oggiISO()); }
      catch (err) { toast(err.message, true); return; }
      chiudiModal(); render(); toast('Incasso registrato.');
      break;
    }
    case 'elimina-incasso': if (confermaAzione('Eliminare questo incasso?')) { eliminaIncasso(id); render(); toast('Incasso eliminato.'); } break;
    case 'sollecita-incasso': {
      const i = (STATE.incassi || []).find(x => x.id === id);
      if (!i) return;
      if (!confermaAzione('Inviare il promemoria di pagamento a ' + nomeCliente(i.clienteId) + '? Lo vedrà nel portale (con notifica).')) return;
      sollecitaIncasso(id); render(); toast('Sollecito inviato tramite portale.');
      break;
    }
    case 'sollecita-tutti-incassi': {
      const lista = incassiDaSollecitare();
      if (!lista.length) return;
      if (!confermaAzione('Inviare ' + lista.length + ' promemoria di pagamento tramite portale ai clienti con incassi scaduti?')) return;
      lista.forEach(i => sollecitaIncasso(i.id));
      render(); toast(lista.length + ' solleciti inviati tramite portale.');
      break;
    }
    case 'preventivo-crea-incasso': {
      const pv = STATE.preventivi.find(x => x.id === id);
      if (!pv) return;
      modalIncasso(null, { clienteId: pv.clienteId, descrizione: pv.oggetto || pv.categoria, importo: pv.importo != null ? pv.importo : '' });
      break;
    }
    case 'orario-apri-picker': {
      const campo = document.getElementById(el.dataset.target);
      const picker = el.parentElement && el.parentElement.querySelector('.orario-picker-nascosto');
      if (!campo || !picker) break;
      picker.value = orarioValido(campo.value) ? campo.value.trim() : '';
      try { if (typeof picker.showPicker === 'function') picker.showPicker(); else { picker.focus(); picker.click(); } } catch (e) { campo.focus(); }
      break;
    }
    case 'nuovo-cliente': modalCliente(null); break;
    case 'apri-cliente': chiudiModal(); SCHEDA_CLIENTE = id; setView('schedacliente'); break;
    case 'modifica-cliente': modalCliente(id); break;
    case 'elimina-cliente':
      if (confermaAzione('Eliminare definitivamente questo cliente? Verranno cancellati anche tutti i dati collegati: documenti, comunicazioni, ritenute, task, F24, contabilità e note sulle scadenze. Operazione irreversibile.')) {
        eliminaCliente(id);
        chiudiModal(); render(); toast('Cliente eliminato.');
      }
      break;
    case 'salva-cliente': {
      const editing = el.dataset.editing === '1';
      const { cliente, valido } = leggiFormCliente(id, editing);
      if (!valido) { toast('Inserisci almeno la ragione sociale.'); return; }
      if (editing && clienteById(id)) {
        // sostituzione completa del record (comportamento storico del form): il record esistente
        // viene rimpiazzato, non fuso campo per campo - aggiornaCliente() invece fa un merge, quindi
        // qui restiamo sull'assegnazione diretta per non cambiare comportamento a chi usa il form.
        const idx = STATE.clienti.findIndex(c => c.id === id);
        // MERGE e non sostituzione: il form non contiene portaleToken/password/accessi del portale e gli
        // altri campi gestiti altrove, che con la sostituzione completa andavano persi a ogni modifica.
        const vecchio = STATE.clienti[idx];
        if (cliente.stato === 'cessato' && !cliente.dataCessazione) cliente.dataCessazione = oggiISO();
        if (cliente.stato === 'attivo' && vecchio.stato === 'potenziale' && !cliente.dataIngresso) cliente.dataIngresso = oggiISO();
        STATE.clienti[idx] = Object.assign({}, vecchio, cliente);
        salvaStato();
      } else {
        aggiungiCliente(cliente);
      }
      chiudiModal(); render(); toast(editing ? 'Cliente aggiornato.' : 'Cliente aggiunto.');
      break;
    }
    case 'guida-tab': apriGuidaTab(); break;
    case 'cambia-tema': impostaTema(temaCorrente() === 'scuro' ? 'chiaro' : 'scuro'); break;
    case 'wiz-apri': wizApri(); break;
    case 'wiz-passo': wizVai(Number(el.dataset.passo)); break;
    case 'wiz-ricontrolla': wizControlla(); break;
    case 'wiz-token-salva': wizSalvaToken(); break;
    case 'wiz-avvia': wizAvviaNgrok(); break;
    case 'wiz-fine': chiudiModal(); render(); break;
    case 'chiudi-modal': chiudiModal(); break;
    case 'pagina-prev': { const v = el.dataset.vista; PAGINE[v] = Math.max(1, (PAGINE[v]||1) - 1); render(); break; }
    case 'pagina-next': { const v = el.dataset.vista; const tot = Number(el.dataset.tot)||1; PAGINE[v] = Math.min(tot, (PAGINE[v]||1) + 1); render(); break; }
    case 'apri-ricerca-globale': modalRicercaGlobale(); break;
    case 'apri-selettore-operatore': modalSelettoreOperatore(); break;
    case 'operatore-scegli': tentaSceltaOperatore(el.dataset.nome); break;
    case 'apri-calendario-campo': { const p = document.querySelector(`[data-action="${el.dataset.target}-picker"]`); if (p) { try { p.showPicker(); } catch (err) { p.focus(); p.click(); } } break; }
    case 'operatore-annulla-password': modalSelettoreOperatore(); break;
    case 'login-operatore': eseguiLoginOperatore(el.dataset.nome); break;
    case 'apri-riferimento-chat': modalRiferimentoChat(); break;
    case 'chat-rif-scegli': inserisciRiferimentoChat(el.dataset.tipo, el.dataset.id, el.dataset.label); break;
    case 'ricerca-apri': { const r = RICERCA_RISULTATI[Number(el.dataset.idx)]; if (r && r.azione) r.azione(); break; }
    case 'chiudi-modal-backdrop': if (e.target === el) chiediPrimaDiChiudereModal(); break;
    case 'conferma-chiusura-annulla': chiudiConfermaChiusuraModal(); break;
    case 'conferma-chiusura-conferma': chiudiConfermaChiusuraModal(); chiudiModal(); break;

    case 'goto-scadenze': setView('scadenze', { filtro: el.dataset.filtro }); break;
    case 'goto-clienti-incompleti': CLI_FILTRO.soloIncompleti = true; CLI_FILTRO.soloGravi = nClientiGravi() > 0; resetPagina('clienti'); setView('clienti'); break;
    case 'cli-filtro-incompleti-vai': CLI_FILTRO.soloIncompleti = true; CLI_FILTRO.soloGravi = nClientiGravi() > 0; resetPagina('clienti'); render(); break;
    case 'nav': setView(el.dataset.nav); break;
    case 'crea-struttura-cartelle': {
      const cl = DOC_FILTRO.cliente !== 'Tutti' ? clienteById(DOC_FILTRO.cliente) : null;
      if (!cl) { toast('Scegli prima un cliente nel filtro.', true); break; }
      fetch('/api/documenti/struttura', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clienti: [{ id: cl.id, nome: cl.ragioneSociale }] }) })
        .then(r => r.json()).then(d => toast(d && d.ok ? `Cartelle standard create per ${cl.ragioneSociale}: ${(d.aree || []).join(', ')}.` : ('Non riuscito: ' + ((d && d.errore) || 'errore')), !(d && d.ok)))
        .catch(() => toast('Server non raggiungibile.', true));
      break;
    }
    case 'task-proc-scegli': impostaProceduraTask(el.dataset.id); break;
    case 'task-proc-rimuovi': impostaProceduraTask(''); break;
    case 'nav-indietro': navIndietro(); break;
    case 'nav-avanti': navAvanti(); break;
    case 'nav-onboarding-cliente': setView('onboarding', { clienteId: id }); break;
    /* Dashboard "Adempimenti annuali in corso" (task #116): in dashboard non c'è un modale di
       dettaglio dedicato (l'unica UI per lavorarci è il pannello espandibile già nella vista
       Adempimenti annuali stessa - stesso pattern di ann-toggle-expand più sotto) — quindi da qui
       si naviga a quella vista, filtrando per il cliente giusto (così la riga è in cima e non
       persa in paginazione tra magari centinaia di adempimenti) e la si apre già espansa. */
    case 'dash-apri-annuale':
    case 'chat-apri-annuale': { // task #132: stesso comportamento, riusato anche dai riferimenti in chat
      const annD = derivati().annuali.find(x => x.id === id);
      if (annD) {
        ANN_FILTRO = { tipo: 'Tutti', resp: 'Tutti', stato: 'Tutti', q: nomeCliente(annD.clienteId) };
        ANN_EXPANDED.add(id);
        resetPagina('annuali');
      }
      setView('annuali');
      break;
    }
    // Riferimento a un documento in chat (task richiesto da Matteo): come per 'chat-apri-annuale',
    // non esiste un modale di dettaglio per un singolo documento - si naviga alla vista Documenti
    // filtrata per il cliente giusto, così il documento citato è in cima e facile da trovare.
    case 'chat-apri-documento': {
      const doc = (STATE.documenti || []).find(x => x.id === id);
      if (doc) {
        DOC_FILTRO = { cliente: doc.clienteId, categoria: 'Tutti' };
        resetPagina('documenti');
      }
      setView('documenti');
      break;
    }

    case 'nuova-ritenuta': modalRitenuta(); break;
    case 'elimina-ritenuta':
      if (confermaAzione('Eliminare questa riga ritenuta?')) {
        STATE.ritenuteRighe = STATE.ritenuteRighe.filter(r => r.id !== id);
        salvaStato(); render(); toast('Riga eliminata.');
      }
      break;
    case 'salva-ritenuta': {
      const clienteId = h('rCliente').value;
      const percipiente = h('rPercipiente').value.trim();
      const dataFattura = h('rDataFattura').value;
      const dataPagamento = h('rDataPagamento').value;
      const numeroFattura = h('rNumeroFattura').value.trim();
      const importo = parseFloat(h('rImporto').value);
      // La data pagamento non è più obbligatoria: se manca, la riga viene salvata come
      // placeholder ("in attesa di pagamento") e non genera scadenza finché non le si imposta
      // una data (vedi calcolaScadenzeRitenute e l'azione "rit-imposta-pagamento").
      if (!clienteId || !percipiente || !dataFattura || !importo) { toast('Compila tutti i campi obbligatori (*).'); return; }
      STATE.ritenuteRighe.push({ id: uid('rit'), clienteId, percipiente, dataFattura, dataPagamento: dataPagamento || null, numeroFattura, importo, statoRit: dataPagamento ? 'Da pagare' : 'In attesa di pagamento' });
      salvaStato(); chiudiModal(); render(); toast(dataPagamento ? 'Ritenuta registrata.' : 'Ritenuta registrata come placeholder: imposta la data di pagamento quando arriva.');
      break;
    }

    case 'nuova-comunicazione': modalComunicazione(el.dataset.cliente || null); break;
    case 'elimina-comunicazione':
      if (confermaAzione('Eliminare questa comunicazione?')) { eliminaComunicazione(id); render(); toast('Comunicazione eliminata.'); }
      break;
    case 'elimina-comunicazione-gruppo':
      if (confermaAzione('Eliminare questa comunicazione per tutti i destinatari?')) {
        STATE.comunicazioni.filter(c => c.gruppoId === id && c.filePercorso).forEach(c => eliminaFileReale(c.filePercorso));
        STATE.comunicazioni = STATE.comunicazioni.filter(c => c.gruppoId !== id);
        salvaStato(); render(); toast('Comunicazione eliminata per tutti i destinatari.');
      }
      break;
    case 'com-toggle-gruppo':
      if (COM_GRUPPI_EXPANDED.has(id)) COM_GRUPPI_EXPANDED.delete(id); else COM_GRUPPI_EXPANDED.add(id);
      render();
      break;
    case 'com-apri-thread': modalThreadComunicazione(id); break;
    case 'com-rispondi': {
      const campo = h('threadRispostaTesto');
      if (!campo || !campo.value.trim()) { toast('Scrivi qualcosa prima di rispondere.', true); return; }
      aggiungiRispostaComunicazione(id, campo.value, 'studio');
      modalThreadComunicazione(id);
      toast('Risposta inviata: il cliente la vedrà nel suo portale.');
      break;
    }
    case 'apri-salva-risposta-doc': {
      COM_SALVA_DOC_RISP_ID = el.dataset.risp;
      modalThreadComunicazione(el.dataset.com);
      break;
    }
    case 'annulla-salva-risposta-doc': {
      COM_SALVA_DOC_RISP_ID = null;
      const comIdCorrente = document.querySelector('[data-action="apri-salva-risposta-doc"], [data-action="conferma-salva-risposta-doc"]');
      // il modale è ancora aperto sullo stesso thread: basta ri-renderizzarlo, l'id lo recuperiamo
      // dal primo bottone di risposta rimasto nel DOM (tutti condividono lo stesso data-com)
      if (comIdCorrente) modalThreadComunicazione(comIdCorrente.dataset.com);
      break;
    }
    case 'conferma-salva-risposta-doc': {
      const comId = el.dataset.com;
      const rispId = el.dataset.risp;
      const categoria = h('salvaDocCategoria') ? h('salvaDocCategoria').value : null;
      const doc = salvaDocumentoDaComunicazione(comId, rispId, categoria);
      COM_SALVA_DOC_RISP_ID = null;
      if (doc) {
        modalThreadComunicazione(comId);
        toast('Documento salvato nella cartella del cliente (' + doc.categoria + ').');
      } else {
        toast('Impossibile salvare: allegato non trovato o già salvato.', true);
      }
      break;
    }
    case 'com-chiudi-richiesta': {
      aggiornaComunicazione(id, { richiestaChiusa: true });
      render();
      modalThreadComunicazione(id);
      toast('Richiesta segnata come chiusa.');
      break;
    }
    case 'com-riapri-richiesta': {
      aggiornaComunicazione(id, { richiestaChiusa: false });
      render();
      modalThreadComunicazione(id);
      toast('Richiesta riaperta.');
      break;
    }
    case 'com-archivia-portale': {
      aggiornaComunicazione(id, { archiviataPortale: true });
      render();
      modalThreadComunicazione(id);
      toast('Comunicazione archiviata: il cliente non la vede più nella lista principale del portale (resta comunque consultabile in "Archiviate").');
      break;
    }
    case 'com-riporta-portale': {
      aggiornaComunicazione(id, { archiviataPortale: false });
      render();
      modalThreadComunicazione(id);
      toast('Comunicazione riportata nella lista principale del portale cliente.');
      break;
    }
    case 'salva-comunicazione': {
      const { clienteIds } = leggiDestinatari('c');
      const data = h('cData').value;
      const categoria = h('cCategoria').value;
      const stato = h('cStato').value;
      const visibilePortale = h('cVisibilePortale').checked;
      const oggetto = h('cOggetto').value.trim();
      const corpo = h('cCorpo').value.trim();
      const note = h('cNote').value.trim();
      if (clienteIds.length === 0 || !data || !oggetto) { toast('Seleziona almeno un destinatario e compila i campi obbligatori (*).'); return; }
      const gruppoId = clienteIds.length > 1 ? uid('comgrp') : null;
      // Task #105: se il destinatario è UN solo cliente e la spunta "Riguarda un F24" è attiva,
      // registriamo automaticamente anche un F24 nella sezione dedicata di quel cliente (con lo
      // stesso eventuale allegato) — un pre-id per la comunicazione ci permette di far comparire
      // lo stesso id come comunicazioneRif sull'F24, per tracciabilità.
      const cIsF24El = h('cIsF24');
      const isF24 = clienteIds.length === 1 && !!(cIsF24El && cIsF24El.checked);
      let f24TipoVal = null, f24ImportoVal = null, comIdPreassegnato = null;
      if (isF24) {
        f24TipoVal = h('cF24Tipo') ? h('cF24Tipo').value : 'Debito';
        f24ImportoVal = (h('cF24Importo') && h('cF24Importo').value !== '') ? Number(h('cF24Importo').value) : null;
        if (f24ImportoVal === null || isNaN(f24ImportoVal)) { toast("Inserisci l'importo dell'F24 (obbligatorio per registrarlo nella sezione F24)."); return; }
        comIdPreassegnato = uid('com');
      }
      // creatoDa (task #98): solo attribuzione/audit di chi ha scritto questa comunicazione da
      // tastiera in questo momento - null se su questo browser non è stato scelto un operatore
      // (nessuna restrizione, la comunicazione si crea comunque).
      const categoriaDocRichiestaEl = h('cCategoriaDocRichiesta');
      const categoriaDocumentoRichiesta = (categoria === 'Raccolta documentale' && categoriaDocRichiestaEl) ? categoriaDocRichiestaEl.value : null;
      const datiComuni = { data, categoria, stato, oggetto, corpo, note, visibilePortale, gruppoId, categoriaDocumentoRichiesta, creatoDa: operatoreCorrente() || null };
      const inputFileCom = h('cFile');
      const fileCom = (inputFileCom && inputFileCom.files && inputFileCom.files[0]) || null;
      if (fileCom) {
        // allegato: una copia per ciascun destinatario, nella sua cartella (stessa logica di Documenti/Contabilità)
        Promise.all(clienteIds.map(clienteId => {
          const cliente = clienteById(clienteId);
          return uploadFileReale(fileCom, clienteId, cliente.ragioneSociale, sottocartellaArea('documenti', null, 'Comunicazioni'))
            .then(esito => ({ clienteId, esito }))
            .catch(err => ({ clienteId, errore: err.message }));
        })).then(risultati => {
          let nFalliti = 0;
          risultati.forEach(({ clienteId, esito, errore }) => {
            const extra = esito ? { filePercorso: esito.percorso, fileNome: esito.nomeFile, fileDimensione: esito.dimensione } : {};
            const extraId = (isF24 && clienteId === clienteIds[0]) ? { id: comIdPreassegnato } : {};
            aggiungiComunicazione(Object.assign({ clienteId }, datiComuni, extra, extraId));
            if (isF24 && clienteId === clienteIds[0]) {
              aggiungiF24(Object.assign({ clienteId, tipo: f24TipoVal, data, importo: f24ImportoVal, descrizione: oggetto, comunicazioneRif: comIdPreassegnato }, extra));
            }
            if (!esito) { nFalliti++; console.error('Upload allegato comunicazione non riuscito:', errore); }
          });
          chiudiModal(); render();
          if (nFalliti === 0) toast(clienteIds.length > 1 ? `Comunicazione e allegato pubblicati per ${clienteIds.length} clienti.` : (isF24 ? 'Comunicazione, allegato e F24 registrati.' : 'Comunicazione e allegato registrati.'));
          else toast(`Comunicazione registrata; l'allegato non è stato caricato per ${nFalliti} ${nFalliti===1?'destinatario':'destinatari'}.`, true);
        });
      } else {
        clienteIds.forEach(clienteId => {
          const extraId = (isF24 && clienteId === clienteIds[0]) ? { id: comIdPreassegnato } : {};
          aggiungiComunicazione(Object.assign({ clienteId }, datiComuni, extraId));
        });
        if (isF24) {
          aggiungiF24({ clienteId: clienteIds[0], tipo: f24TipoVal, data, importo: f24ImportoVal, descrizione: oggetto, comunicazioneRif: comIdPreassegnato });
        }
        chiudiModal(); render(); toast(clienteIds.length > 1 ? `Comunicazione pubblicata per ${clienteIds.length} clienti.` : (isF24 ? 'Comunicazione e F24 registrati.' : 'Comunicazione registrata.'));
      }
      break;
    }

    case 'nuova-comunicazione-ricorrente': modalComunicazioneRicorrente(); break;
    // Richiesta diretta di Matteo (stagione 770): un modello pronto, collegato all'adempimento
    // annuale '770' così i destinatari sono automaticamente tutti i clienti con quell'adempimento
    // applicabile (sostituti d'imposta con dipendenti/collaboratori) — niente lista da tenere a
    // mano. Soglia impostata al 1° settembre: ben prima della scadenza del 770 (31 ottobre), lascia
    // tempo di raccogliere il dato e predisporre la dichiarazione. Si apre il form già compilato
    // per un'ultima revisione, il modello non viene salvato finché non si preme "Salva".
    case 'nuovo-modello-770-cf-sostituto':
      modalComunicazioneRicorrente(null, {
        oggetto: 'Richiesta dato per il 770: codice fiscale del consulente del lavoro',
        corpo: 'Per la predisposizione del modello 770 abbiamo bisogno del nominativo e del codice fiscale del consulente del lavoro che gestisce le paghe e le ritenute dei vostri dipendenti/collaboratori (non il codice fiscale dell\'azienda, che abbiamo già). Se le paghe sono gestite internamente o da un altro soggetto, indicatecelo. Vi chiediamo di rispondere a questo messaggio con il dato appena possibile, per non ritardare l\'invio della dichiarazione.',
        categoria: 'Amministrativa',
        adempimentoCollegato: 'a:770',
        frequenza: 'Annuale', giorno: 1, mese: 9,
      });
      break;
    case 'modifica-comunicazione-ricorrente': modalComunicazioneRicorrente(id); break;
    case 'elimina-comunicazione-ricorrente':
      if (confermaAzione('Eliminare questo modello ricorrente? Le comunicazioni già generate restano.')) {
        eliminaComunicazioneRicorrente(id); chiudiModal(); render(); toast('Modello ricorrente eliminato.');
      }
      break;
    case 'salva-comunicazione-ricorrente': {
      const editing = el.dataset.editing === '1';
      const adempimentoCollegato = h('crAdempimento').value || null;
      const destinatari = adempimentoCollegato ? { modo: 'adempimento', clienteIds: [] } : leggiDestinatari('cr');
      const categoria = h('crCategoria').value;
      const attiva = h('crAttiva').checked;
      const frequenza = h('crFrequenza').value;
      const giorno = Math.max(1, Math.min(28, Number(h('crGiorno').value) || 1));
      const mese = Number(h('crMese').value) || 1;
      const oggetto = h('crOggetto').value.trim();
      const corpo = h('crCorpo').value.trim();
      if ((!adempimentoCollegato && destinatari.clienteIds.length === 0) || !oggetto) { toast('Seleziona almeno un destinatario (o collega un adempimento) e inserisci un oggetto.'); return; }
      const datiComuni = { destinatari, categoria, attiva, frequenza, giorno, mese, oggetto, corpo, adempimentoCollegato };
      if (editing) aggiornaComunicazioneRicorrente(id, datiComuni);
      else aggiungiComunicazioneRicorrente(datiComuni);
      chiudiModal(); render(); toast(editing ? 'Modello aggiornato.' : 'Modello ricorrente creato.');
      break;
    }

    case 'nuovo-documento': modalDocumento(); break;
    case 'elimina-documento':
      if (confermaAzione('Eliminare questo documento dal tracciamento?')) { eliminaDocumento(id); render(); toast('Documento eliminato.'); }
      break;
    case 'apri-cartella-documento': apriCartellaDocumento(el.dataset.percorso); break;
    case 'salva-documento': {
      const clienteId = h('dCliente').value;
      const categoria = h('dCategoria').value;
      const nome = h('dNome').value.trim();
      const dataCaricamento = h('dDataCaricamento').value || oggiISO();
      const dataScadenza = h('dDataScadenza').value || null;
      if (!clienteId || !nome) { toast('Compila i campi obbligatori (*).'); return; }
      const datiBase = { clienteId, categoria, nome, dataCaricamento, dataScadenza };
      const inputFile = h('dFile');
      const file = (inputFile && inputFile.files && inputFile.files[0]) || null;
      if (file) {
        const clienteNome = clienteById(clienteId).ragioneSociale;
        uploadFileReale(file, clienteId, clienteNome, sottocartellaPerCategoria(categoria, dataCaricamento)).then(esito => {
          aggiungiDocumento(Object.assign({}, datiBase, { filePercorso: esito.percorso, fileNome: esito.nomeFile, fileDimensione: esito.dimensione }));
          chiudiModal(); render(); toast('Documento e file caricati.');
        }).catch(err => {
          console.error('Upload file documento non riuscito:', err.message);
          aggiungiDocumento(datiBase);
          chiudiModal(); render(); toast('Documento registrato, ma il file non è stato caricato: ' + err.message, true);
        });
      } else {
        aggiungiDocumento(datiBase);
        chiudiModal(); render(); toast('Documento aggiunto.');
      }
      break;
    }

    case 'nuovo-f24': modalF24(null); break;
    case 'modifica-f24': modalF24(id); break;
    case 'elimina-f24':
      if (confermaAzione('Eliminare questo F24 dal registro?')) { eliminaF24(id); render(); toast('F24 eliminato.'); }
      break;
    case 'f24-segna-pagato': segnaF24TutteRighe(id, true); render(); toast('F24 segnato come pagato.'); break;
    case 'f24-segna-da-pagare': segnaF24TutteRighe(id, false); render(); toast('F24 segnato come da pagare.'); break;

    case 'imp-sezione':
      IMP_SEZIONE = el.dataset.sezione;
      render();
      break;
    // Task #215: bottoni della checklist di avvio in "Oggi". "manuale" = passo senza un dato che lo
    // dimostri (es. team): si considera fatto nel momento in cui l'utente ci va.
    case 'task-filtro-azzera': TASK_FILTRO.q = ''; TASK_FILTRO.dataDa = ''; TASK_FILTRO.dataA = ''; TASK_FILTRO.stato = 'Tutti'; TASK_FILTRO.ritardo = false; STATI_TASK_TEAM.forEach(s=>resetPagina('taskteam-'+s)); render(); break;
    case 'task-filtro-ritardo': TASK_FILTRO.ritardo = !TASK_FILTRO.ritardo; STATI_TASK_TEAM.forEach(s=>resetPagina('taskteam-'+s)); render(); break;
    case 'task-filtro-stato': TASK_FILTRO.stato = TASK_FILTRO.stato === el.dataset.stato ? 'Tutti' : el.dataset.stato; STATI_TASK_TEAM.forEach(s=>resetPagina('taskteam-'+s)); render(); break;
    case 'task-motivo-conferma': { const inp = document.getElementById('motivo_' + id); if (!confermaMotivoStatoTask(id, inp ? inp.value : '')) { toast('Scrivi il motivo prima di confermare.', true); break; } render(); toast('Motivo confermato e salvato nello storico del task.'); break; }
    case 'task-motivo-modifica': MOTIVO_IN_MODIFICA = id; render(); { const inp = document.getElementById('motivo_' + id); if (inp) inp.focus(); } break;
    case 'task-motivo-annulla': MOTIVO_IN_MODIFICA = null; render(); break;
    case 'modulo-prev-nuovo': modalModuloPreventivo(null); break;
    case 'modulo-prev-modifica': modalModuloPreventivo(el.dataset.id); break;
    case 'modulo-prev-duplica': {
      const m = (STATE.moduliPreventivo || []).find(x => x.id === el.dataset.id); if (!m) break;
      STATE.moduliPreventivo.push(Object.assign(JSON.parse(JSON.stringify(m)), { id: uid('modp'), nome: m.nome + ' (copia)' })); salvaStato(); render(); break;
    }
    case 'modulo-prev-elimina':
      if (confermaAzione('Eliminare questo modulo? I preventivi già creati non cambiano.')) { STATE.moduliPreventivo = (STATE.moduliPreventivo || []).filter(x => x.id !== el.dataset.id); salvaStato(); render(); }
      break;
    case 'modulo-prev-salva': {
      const nome = h('mpNome').value.trim(); if (!nome) { toast('Il nome è obbligatorio.', true); break; }
      const attivita = h('mpAttivita').value.split('\n').map(r => r.trim()).filter(Boolean).map(r => { const i = r.indexOf(':'); return i < 0 ? { titolo: r, descrizione: '' } : { titolo: r.slice(0, i).trim(), descrizione: r.slice(i + 1).trim() }; });
      const cp = h('mpCompenso').value;
      const dati = { nome, oggetto: h('mpOggetto').value.trim(), richiesta: h('mpRichiesta').value.trim(), compenso: cp === '' ? null : Number(cp), attivita, attivo: true };
      const lista = STATE.moduliPreventivo = STATE.moduliPreventivo || [];
      const esistente = el.dataset.id ? lista.find(x => x.id === el.dataset.id) : null;
      if (esistente) Object.assign(esistente, dati); else lista.push(Object.assign({ id: uid('modp') }, dati));
      salvaStato(); document.getElementById('modalRoot').innerHTML = ''; render(); toast('Modulo salvato.'); break;
    }
    case 'setup-vai':
      if (el.dataset.imp) IMP_SEZIONE = el.dataset.imp;
      if (el.dataset.manuale === 'team') { STATE.meta.teamConfermato = true; salvaStato(); }
      if (el.dataset.filtro === 'incompleti') { CLI_FILTRO.soloIncompleti = true; CLI_FILTRO.soloGravi = nClientiGravi() > 0; resetPagina('clienti'); }
      setView(el.dataset.nav);
      break;
    case 'setup-nascondi':
      STATE.meta.setupNascosto = true;
      salvaStato();
      render();
      break;
    case 'moduli-tutti': {
      if (!STATE.meta) break;
      STATE.meta.moduliDisattivati = el.dataset.val === '1' ? [] : MODULI.map(m => m.id);
      salvaStato(); render();
      break;
    }
    case 'conferma-moduli':
      STATE.meta.moduliConfermati = true;
      salvaStato();
      toast('Moduli confermati.');
      setView('oggi');
      break;

    case 'avvia-ngrok': avviaNgrokDaPrisma(Number(el.dataset.porta), el.textContent); break;

    case 'copia-link-rete': copiaLinkRete(Number(el.dataset.porta)); break;
    case 'copia-link-ngrok': copiaLinkNgrok(Number(el.dataset.porta)); break;
    case 'copia-link-cliente': copiaLinkClientePortale(el.dataset.id, el.dataset.modo); break;

    case 'salva-accesso-esterno': {
      const tipo = el.dataset.tipo;
      const utente = (h('accEst_' + tipo + '_utente') || {}).value || '';
      const password = (h('accEst_' + tipo + '_password') || {}).value || '';
      if (!utente.trim() || !password.trim()) { toast('Inserisci utente e password prima di attivare.'); return; }
      fetch('/api/accesso-esterno', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, utente: utente.trim(), password }),
      }).then(r => r.json()).then(() => {
        ACCESSO_ESTERNO_CACHE = null;
        ACCESSO_ESTERNO_DRAFT = null; // si reinizializza dalla cache fresca appena riletta, vedi caricaStatoAccessoEsterno
        render();
        toast('Accesso esterno salvato e attivato.');
      }).catch(() => toast('Errore nel salvare l\'accesso esterno.'));
      break;
    }
    case 'disattiva-accesso-esterno': {
      const tipo = el.dataset.tipo;
      fetch('/api/accesso-esterno', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, utente: '', password: '' }),
      }).then(r => r.json()).then(() => {
        ACCESSO_ESTERNO_CACHE = null;
        ACCESSO_ESTERNO_DRAFT = null;
        render();
        toast('Accesso esterno disattivato.');
      }).catch(() => toast('Errore nel disattivare l\'accesso esterno.'));
      break;
    }

    case 'chat-apri-con':
      CHAT_CON = el.dataset.nome;
      render();
      requestAnimationFrame(() => { const c = h('chatThreadCorpo'); if (c) c.scrollTop = c.scrollHeight; });
      break;
    case 'chat-invia': {
      const campo = h('chatTesto');
      if (!campo || !campo.value.trim() || !CHAT_CON) return;
      aggiungiChatMessaggio(operatoreCorrente(), CHAT_CON, campo.value);
      render();
      requestAnimationFrame(() => { const c = h('chatThreadCorpo'); if (c) c.scrollTop = c.scrollHeight; const t = h('chatTesto'); if (t) t.focus(); });
      break;
    }
    case 'f24-riga-aggiungi': F24_RIGHE_MODAL.push(nuovaRigaF24Modal()); renderRigheF24Modal(); break;
    case 'f24-riga-rimuovi': {
      const idx = Number(el.dataset.idx);
      F24_RIGHE_MODAL.splice(idx, 1);
      renderRigheF24Modal();
      break;
    }
    case 'f24-cliente-scegli': {
      const clienteScelto = clienteById(el.dataset.id);
      if (!clienteScelto) return;
      h('fCliente').value = clienteScelto.id;
      h('fClienteRicerca').value = clienteScelto.ragioneSociale;
      F24_CLIENTE_QUERY = '';
      renderRisultatiClienteF24();
      aggiornaSuggerimentoImportoF24(); // stesso effetto che aveva il 'change' del vecchio <select>
      break;
    }

    case 'nuova-regola-importo': modalRegolaImportoStatutario(null); break;
    case 'modifica-regola-importo': modalRegolaImportoStatutario(id); break;
    case 'elimina-regola-importo':
      if (confermaAzione('Eliminare questa regola? Non verranno più suggeriti importi per questo adempimento.')) { eliminaRegolaImportoStatutario(id); render(); toast('Regola eliminata.'); }
      break;
    case 'salva-regola-importo': {
      const nome = h('riNome').value.trim();
      const chiave = h('riChiave').value;
      if (!nome || !chiave) { toast('Compila i campi obbligatori (*).'); return; }
      const doppione = (STATE.regoleImportiStatutari || []).find(r => r.chiave === chiave && r.id !== id);
      if (doppione) { toast(`Esiste già una regola per questo adempimento ("${doppione.nome}"): modifica quella invece di crearne una seconda, altrimenti solo la prima verrebbe usata.`, true); return; }
      const dati = {
        nome, chiave,
        importoBase: h('riImportoBase').value !== '' ? Number(h('riImportoBase').value) : 0,
        importoPerSedeAggiuntiva: h('riImportoSede').value !== '' ? Number(h('riImportoSede').value) : 0,
        sogliaCapitaleSociale: h('riSoglia').value !== '' ? Number(h('riSoglia').value) : null,
        importoSopraSoglia: h('riImportoSopraSoglia').value !== '' ? Number(h('riImportoSopraSoglia').value) : null,
        nota: h('riNota').value.trim(),
      };
      if (id) aggiornaRegolaImportoStatutario(id, dati); else aggiungiRegolaImportoStatutario(dati);
      chiudiModal(); render(); toast(id ? 'Regola aggiornata.' : 'Regola creata.');
      break;
    }

    case 'nuova-attivita-catalogo': modalAttivitaCatalogo(null); break;
    case 'modifica-attivita-catalogo': modalAttivitaCatalogo(id); break;
    case 'elimina-attivita-catalogo':
      if (confermaAzione('Eliminare questa attività dal listino? I documenti già creati che la citano non vengono modificati.')) { eliminaAttivitaCatalogo(id); render(); toast('Attività eliminata.'); }
      break;
    case 'salva-attivita-catalogo': {
      const nome = h('acNome').value.trim();
      if (!nome) { toast('Il nome dell\'attività è obbligatorio.'); return; }
      const dati = {
        nome,
        descrizione: h('acDescrizione').value.trim(),
        prezzo: h('acPrezzo').value !== '' ? Number(h('acPrezzo').value) : null,
        richiedeMandato: h('acRichiedeMandato').checked,
      };
      if (id) aggiornaAttivitaCatalogo(id, dati); else aggiungiAttivitaCatalogo(dati);
      chiudiModal(); render(); toast(id ? 'Attività aggiornata.' : 'Attività creata.');
      break;
    }
    case 'salva-f24': {
      const clienteId = h('fCliente').value;
      const tipo = h('fTipo').value;
      const data = h('fData').value || oggiISO();
      const descrizione = h('fDescrizione').value.trim();
      const chiaveAdempimento = h('fChiaveAdempimento') ? (h('fChiaveAdempimento').value || null) : null;
      // Righe (task Matteo: codici tributo + pagamento misto) - scarta righe senza importo valido
      // (es. una riga aggiunta e poi lasciata vuota), non blocca il salvataggio per quello.
      const righe = F24_RIGHE_MODAL
        .filter(r => r.importo !== null && r.importo !== '' && !isNaN(Number(r.importo)) && Number(r.importo) > 0)
        .map(r => ({ id: r.id, codiceTributo: (r.codiceTributo || '').trim(), descrizione: (r.descrizione || '').trim(), importo: Number(r.importo), importoPagato: Number(r.importoPagato) || 0 }));
      if (!clienteId || righe.length === 0) { toast('Compila almeno una riga con un importo valido e i campi obbligatori (*).'); return; }
      const rigaSottoPagato = righe.find(r => r.importo < r.importoPagato - 0.004);
      if (rigaSottoPagato) { toast(`L'importo di una riga non può essere inferiore a quanto già pagato su quella riga (€ ${fmtNum2(rigaSottoPagato.importoPagato)}).`, true); return; }
      const datiF24 = { clienteId, tipo, data, descrizione, chiaveAdempimento, righe };
      if (id) aggiornaF24(id, datiF24); else aggiungiF24(datiF24);
      chiudiModal(); render(); toast(id ? 'F24 aggiornato.' : 'F24 registrato.');
      break;
    }

    case 'nuovo-modello': modalModelloDocumento(null); break;
    case 'modifica-modello': modalModelloDocumento(id); break;
    case 'duplica-modello': duplicaModelloDocumento(id); render(); toast('Modello duplicato.'); break;
    case 'elimina-modello':
      if (confermaAzione('Eliminare questo modello? I documenti già creati da questo modello non verranno modificati.')) { eliminaModelloDocumento(id); render(); toast('Modello eliminato.'); }
      break;
    case 'salva-modello': {
      const categoria = h('modCategoria').value.trim();
      const nomeModello = h('modNome').value.trim();
      const corpo = editorDocumentoToTesto(h('modCorpo'));
      if (!categoria || !nomeModello || !corpo.trim()) { toast('Compila categoria, nome e testo del modello.'); return; }
      const attivo = h('modAttivo').checked;
      const predefinito = h('modPredefinito').checked;
      if (predefinito) {
        // un solo modello predefinito per categoria: disattiva gli altri della stessa categoria
        STATE.modelliDocumento.filter(m => m.categoria === categoria && m.id !== id).forEach(m => { m.predefinito = false; });
      }
      const dati = { categoria, nome: nomeModello, corpo, attivo, predefinito };
      if (id) aggiornaModelloDocumento(id, dati); else aggiungiModelloDocumento(dati);
      potaImmaginiDocumenti(); salvaStato();
      chiudiModal(); render(); toast(id ? 'Modello aggiornato.' : 'Modello creato.');
      break;
    }
    case 'modelli-base-strutturati': { const n = aggiungiModelliBaseStrutturati(); render(); toast(n ? n + ' modelli aggiunti.' : 'Modelli già presenti.'); break; }
    case 'doc-fmt': docEseguiComando(el.dataset.cmd); break;
    case 'doc-img': docImmagineOperazione(el.closest('.d-img'), el.dataset.op); break;
    case 'doc-campo': docInserisciCampo(el.dataset.chiave); break;
    case 'doc-campo-nuovo': {
      const inp = document.getElementById('docNuovoCampoNome');
      const nome = inp ? inp.value.trim() : '';
      if (!nome) { toast('Scrivi il nome del campo (es. "Data inizio incarico").'); return; }
      const parole = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(/\s+/);
      const chiave = parole.map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
      if (!chiave) { toast('Nome campo non valido.'); return; }
      docInserisciCampo(chiave);
      inp.value = '';
      break;
    }

    case 'nuova-procedura': modalProceduraInterna(null); break;
    case 'apri-procedura': modalDettaglioProcedura(id, el.dataset.app ? { app: el.dataset.app } : null); break;
    case 'guida-leggi': apriGuida(id); break;
    case 'procedura-indietro':
      if (el.dataset.app) apriModalAppuntamento(el.dataset.app);
      else if (el.dataset.task) {
        const nuovo = el.dataset.task === '__nuovo__';
        if (TASK_BOZZA && TASK_BOZZA.id === (nuovo ? null : el.dataset.task)) TASK_BOZZA.ripristina = true;
        modalTaskTeam(nuovo ? null : el.dataset.task);
      }
      else chiudiModal();
      break;
    case 'modifica-procedura': modalProceduraInterna(id); break;
    case 'duplica-procedura': duplicaProceduraInterna(id); render(); toast('Procedura duplicata.'); break;
    case 'elimina-procedura':
      if (confermaAzione('Eliminare questa procedura?')) { chiudiModal(); eliminaProceduraInterna(id); render(); toast('Procedura eliminata.'); }
      break;
    case 'salva-procedura': {
      const categoria = h('procCategoria').value.trim();
      const nomeProc = h('procNome').value.trim();
      const contenuto = h('procContenuto').value;
      if (!categoria || !nomeProc || !contenuto.trim()) { toast('Compila categoria, nome e contenuto della procedura.'); return; }
      const checklistDocumenti = h('procChecklist').value.split('\n').map(s => s.trim()).filter(Boolean);
      const attivo = h('procAttivo').checked;
      const dati = { categoria, nome: nomeProc, contenuto, checklistDocumenti, attivo };
      if (id) aggiornaProceduraInterna(id, dati); else aggiungiProceduraInterna(dati);
      chiudiModal(); render(); toast(id ? 'Procedura aggiornata.' : 'Procedura creata.');
      break;
    }

    case 'nuovo-preventivo': modalPreventivo(null, el.dataset.cliente || null, el.dataset.aml === '1', null, !!el.dataset.cliente); break;
    case 'apri-preventivo': modalDettaglioPreventivo(id); break;
    case 'modifica-preventivo': modalPreventivo(id); break;
    case 'elimina-preventivo':
      if (confermaAzione('Eliminare questo documento?')) { chiudiModal(); eliminaPreventivo(id); render(); toast('Documento eliminato.'); }
      break;
    case 'salva-preventivo': {
      // In creazione con cliente bloccato (aperto dal fascicolo di un cliente specifico) non esiste
      // un <select> #pCliente da leggere: il cliente va recuperato da data-cliente-attuale sul
      // modale (impostato da modalPreventivo a ogni render, bloccato o no).
      const modalElSalva = document.querySelector('.modal');
      const clienteIdSel = h('pCliente') ? h('pCliente').value : (modalElSalva ? modalElSalva.dataset.clienteAttuale : null);
      const editingDoc = id ? STATE.preventivi.find(x => x.id === id) : null;
      const clienteId = clienteIdSel || (editingDoc ? editingDoc.clienteId : null);
      const oggetto = h('pOggetto').value.trim();
      const importoVal = h('pImporto').value === '' ? null : Number(h('pImporto').value);
      const dataEmissione = h('pDataEmissione').value || oggiISO();
      const validoFino = h('pValidoFino').value || null;
      const stato = h('pStato').value;
      const note = h('pNote').value.trim();
      if (!clienteId || !oggetto) { toast('Compila i campi obbligatori (*).'); return; }
      const valoriCustom = {};
      document.querySelectorAll('#formPreventivo [data-campo-custom]').forEach(elc => { valoriCustom[elc.dataset.chiave] = elc.value.trim(); });
      if (id) {
        aggiornaPreventivo(id, { oggetto, importo: importoVal, dataEmissione, validoFino, stato, note, valoriCustom });
      } else {
        const modelloId = el.dataset.modello;
        const modello = STATE.modelliDocumento.find(m => m.id === modelloId);
        if (!modello) { toast('Modello non trovato.'); return; }
        // Attività a listino scelte (task #138): snapshot con prezzo e richiedeMandato al momento
        // della creazione — così restano coerenti anche se il catalogo cambia/si elimina una voce
        // in seguito, ed è ciò che decide se comparirà "Genera mandato collegato" nel dettaglio.
        const attivitaScelte = Array.from(document.querySelectorAll('[data-attivita-catalogo]:checked')).map(c => ({
          id: c.dataset.id, nome: c.dataset.nome,
          prezzo: c.dataset.prezzo !== '' ? Number(c.dataset.prezzo) : null,
          richiedeMandato: c.dataset.mandato === '1',
        }));
        creaPreventivoDaModello({ clienteId, modelloId, oggetto, importo: importoVal, dataEmissione, validoFino, stato, note, valoriCustom, attivitaScelte });
      }
      chiudiModal(); render(); toast(id ? 'Documento aggiornato.' : 'Documento creato.');
      break;
    }
    // Genera un nuovo Mandato professionale a partire da un Preventivo appena accettato (task
    // #138): riusa cliente/attività/importo, marca entrambi i documenti come collegati
    // (mandatoGeneratoId / preventivoOrigineId) così il pulsante non compare più due volte e la
    // regola di Matteo è rispettata — "prima preventivo, poi mandato solo se accettato", mai un
    // mandato slegato o duplicato. Visibile solo se il preventivo lo richiede (vedi
    // modalDettaglioPreventivo): niente mandato per una pratica singola che non lo prevede.
    case 'preventivo-genera-mandato': {
      const p = STATE.preventivi.find(x => x.id === id);
      if (!p) return;
      const mandato = generaMandatoDaPreventivo(p);
      if (!mandato) return;
      modalDettaglioPreventivo(mandato.id);
      toast('Mandato generato dal preventivo accettato.');
      break;
    }
    case 'proroga-crea': {
      const o = opzioniProroga()[Number(h('prScad').value)];
      const nd = h('prData').value;
      if (!o || !nd) { toast('Scegli la scadenza e la nuova data.'); return; }
      const nuova = aggiungiProroga({ tipo: o.tipo, dataOriginale: o.dataOriginale, dataNuova: nd, motivo: h('prMotivo').value.trim() });
      render(); toast(`Proroga applicata a ${o.clienti.size} clienti: scegli ora chi aderisce.`);
      modalProrogaClienti(nuova.id); break;
    }
    case 'proroga-clienti': modalProrogaClienti(id); break;
    case 'proroga-clienti-tutti': document.querySelectorAll('input[data-prc]').forEach(x => { if (x.closest('tr').style.display !== 'none') x.checked = el.dataset.val === '1'; }); prcAggiornaConteggio(); break;
    case 'proroga-clienti-salva': {
      const p = (STATE.proroghe || []).find(x => x.id === id);
      if (!p) break;
      const tutte = Array.from(document.querySelectorAll('input[data-prc]'));
      const sel = tutte.filter(x => x.checked).map(x => x.dataset.prc);
      p.clienteIds = sel.length === tutte.length ? null : sel;
      salvaStato(); chiudiModal(); render();
      toast(sel.length === tutte.length ? 'Proroga valida per tutti i clienti.' : `Proroga valida per ${sel.length} di ${tutte.length} clienti.`);
      break;
    }
    case 'proroga-elimina': if (confermaAzione('Annullare la proroga? Le scadenze tornano alla data ordinaria.')) { eliminaProroga(id); render(); } break;
    case 'report-mensile-apri': modalReportMensile(el.dataset.cliente); break;
    case 'report-mensile-salva': {
      const cid = el.dataset.cliente, mese = h('rmMese').value || oggiISO().slice(0, 7);
      aggiungiComunicazione({ clienteId: cid, data: oggiISO(), categoria: 'Altro', stato: 'Bozza', oggetto: 'Riepilogo mensile ' + mese, corpo: h('rmTesto').value });
      chiudiModal(); render(); toast('Bozza creata in Comunicazioni.'); break;
    }
    case 'deon-tab': DEON_TAB = el.dataset.tab; render(); break;
    case 'deon-ia-esporta': salvaFileScaricabile('registro-uso-ia.csv', registroIaCsv()); break;
    case 'deon-fpc-nuovo': modalFpc(); break;
    case 'deon-fpc-salva': {
      const titolo = h('fpcTitolo').value.trim(), crediti = Number(h('fpcCrediti').value);
      if (!titolo || !(crediti >= 0) || h('fpcCrediti').value === '') { toast('Compila evento e crediti.'); return; }
      STATE.fpc.push({ id: uid('fpc'), persona: h('fpcPersona').value, data: h('fpcData').value || oggiISO(), titolo, crediti, obbligatoria: h('fpcObb').checked });
      salvaStato(); chiudiModal(); render(); break;
    }
    case 'deon-fpc-elimina': STATE.fpc = STATE.fpc.filter(x => x.id !== id); salvaStato(); render(); break;
    case 'deon-riserv-nuovo': modalRiservatezza(); break;
    case 'deon-riserv-salva': {
      const persona = h('rsPersona').value.trim();
      if (!persona) { toast('Indica la persona.'); return; }
      STATE.impegniRiservatezza.push({ id: uid('rs'), persona, tipo: h('rsTipo').value, data: h('rsData').value || null, scadenza: h('rsScad').value || null });
      salvaStato(); chiudiModal(); render(); break;
    }
    case 'deon-riserv-elimina': STATE.impegniRiservatezza = STATE.impegniRiservatezza.filter(x => x.id !== id); salvaStato(); render(); break;
    case 'stampa-libro-nuova': modalStampaLibro(el.dataset.cliente || (LIBRI_FILTRO.cliente !== 'Tutti' ? LIBRI_FILTRO.cliente : null)); break;
    case 'stampa-libro-salva': {
      const descrizione = h('slDescr').value.trim(); if (!descrizione) { toast('Scrivi cosa va stampato.', true); break; }
      STATE.stampeLibri.push({ id: uid('stl'), clienteId: h('slCliente').value, sezione: h('slSezione').value, descrizione, data: h('slData').value || oggiISO(), creatoIl: oggiISO(), stampatoIl: null });
      salvaStato(); chiudiModal(); render(); toast('Aggiunto ai verbali da stampare.'); break;
    }
    case 'stampa-libro-elimina': STATE.stampeLibri = (STATE.stampeLibri || []).filter(x => x.id !== el.dataset.id); salvaStato(); render(); break;
    case 'libro-nuovo': modalLibroSociale(null); break;
    case 'libro-modifica': modalLibroSociale(id); break;
    case 'libri-filtro-apri': LIBRI_FILTRO.cliente = id; render(); break;
    case 'libro-elimina': if (confermaAzione('Eliminare questo libro dal registro?')) { eliminaLibroSociale(id); render(); } break;
    case 'atto-nuovo': modalAttoLibro(null); break;
    case 'atto-modifica': modalAttoLibro(id); break;
    case 'atto-scollega': if (confermaAzione('Togliere questo atto dal libro? Il documento resta in Documenti.')) { scollegaAttoLibro(id); render(); } break;
    case 'atto-salva': {
      const clienteId = el.dataset.cliente;
      const dati = { libroId: (libroDelCliente(clienteId) || {}).id, sezioneLibro: h('atLibro').value, dataAtto: h('atData').value, tipoAtto: h('atTipo').value, pagine: h('atPagine').value.trim(), trascritto: h('atTrascr').checked };
      if (!dati.dataAtto) { toast('Indica la data dell\'atto: serve per metterlo in ordine nel libro.'); return; }
      if (id) { assegnaAttoLibro(id, dati); chiudiModal(); render(); toast('Atto aggiornato.'); break; }
      const docSel = h('atDoc') ? h('atDoc').value : '';
      if (docSel) { assegnaAttoLibro(docSel, dati); chiudiModal(); render(); toast('Atto collegato al libro.'); break; }
      const nome = (h('atNome') ? h('atNome').value.trim() : '') || ('Atto del ' + fmtData(dati.dataAtto));
      const base = { clienteId, categoria: 'Verbale / decisione societaria', nome, dataCaricamento: oggiISO(), dataScadenza: null };
      const inputFile = h('atFile'); const file = (inputFile && inputFile.files && inputFile.files[0]) || null;
      const salva = (extraDoc) => { const nuovo = aggiungiDocumento(Object.assign({}, base, extraDoc || {})); assegnaAttoLibro(nuovo.id, dati); chiudiModal(); render(); };
      if (file) {
        uploadFileReale(file, clienteId, clienteById(clienteId).ragioneSociale, sottocartellaArea('libri')).then(esito => { salva({ filePercorso: esito.percorso, fileNome: esito.nomeFile, fileDimensione: esito.dimensione }); toast('Atto e file caricati.'); })
          .catch(err => { salva(); toast('Atto registrato, ma il file non è stato caricato: ' + err.message, true); });
      } else { salva(); toast('Atto registrato (senza file).'); }
      break;
    }
    case 'libro-salva': {
      const dati = { clienteId: h('libCliente').value, tipo: 'Libri sociali', statoFisico: h('libStatoFisico').value, detenutoDa: h('libDetenuto').value, detentoreNote: h('libDetNote').value.trim(), ultimaStampa: h('libStampa').value || null, ultimaPagina: h('libPagina').value, vidimazione: h('libVidim').value || null, note: h('libNote').value.trim() };
      if (!dati.clienteId) { toast('Scegli il cliente.'); return; }
      if (!id && libroDelCliente(dati.clienteId)) { toast('Questo cliente ha già i suoi libri: modifica quelli esistenti.', true); return; }
      if (id) aggiornaLibroSociale(id, dati); else aggiungiLibroSociale(dati);
      chiudiModal(); render(); toast('Libro salvato.');
      break;
    }
    case 'fatt-nuova': modalAttivitaFatturabile(); break;
    case 'fatt-salva': {
      const clienteId = h('fattCliente').value, descrizione = h('fattDescr').value.trim();
      if (!clienteId || !descrizione) { toast('Compila i campi obbligatori (*).'); return; }
      aggiungiAttivitaFatturabile({ clienteId, descrizione, data: h('fattData').value || oggiISO(), importo: h('fattImporto').value });
      chiudiModal(); render(); toast('Attività registrata.');
      break;
    }
    case 'fatt-elimina': if (confermaAzione('Eliminare questa attività?')) { eliminaAttivitaFatturabile(id); render(); } break;
    case 'fatt-segna-apri': {
      const cid = el.dataset.cliente;
      const ids = Array.from(document.querySelectorAll('.fatt-sel:checked')).filter(x => x.dataset.cliente === cid).map(x => x.dataset.id);
      modalSegnaFatturate(cid, ids);
      break;
    }
    case 'fatt-segna-conferma': {
      const modalEl = document.querySelector('.modal');
      const ids = (modalEl && modalEl.dataset.ids ? modalEl.dataset.ids.split(',') : []).filter(Boolean);
      const periodica = !!(h('sfPeriodica') && h('sfPeriodica').checked);
      if (!ids.length && !periodica) { toast('Nessuna attività selezionata.'); return; }
      const r = segnaAttivitaFatturate(ids, { clienteId: el.dataset.cliente, numero: h('sfNumero').value.trim(), data: h('sfData').value || oggiISO(), periodica, creaIncasso: !!(h('sfIncasso') && h('sfIncasso').checked), importoIncasso: h('sfImporto') ? h('sfImporto').value : 0 });
      chiudiModal(); render(); toast(`${r.segnate} attività segnate come fatturate${r.incasso ? ' · incasso creato' : ''}.`);
      break;
    }
    case 'preventivo-accetta-apri': modalAccettazionePreventivo(id); break;
    case 'preventivo-accetta-conferma': {
      const p = STATE.preventivi.find(x => x.id === id);
      if (!p) return;
      { const cp = clienteById(p.clienteId); if (cp && cp.stato === 'potenziale' && !confermaAzione('Confermi l\'accettazione? Il cliente diventa attivo: vengono create la scheda cliente, le scadenze collegate e il task di apertura posizione.')) return; }
      const data = h('accData').value || oggiISO(), nota = h('accNota').value.trim();
      const inputFile = h('accFile');
      const file = (inputFile && inputFile.files && inputFile.files[0]) || null;
      const fine = (esito) => {
        const r = accettaPreventivo(id, { data, nota, file: esito, responsabile: h('accResp') ? h('accResp').value : null, assegnatarioApertura: h('accApertura') ? h('accApertura').value : null });
        chiudiModal(); render(); modalDettaglioPreventivo(id);
        toast(r && r.attivato ? 'Preventivo accettato: cliente attivato, onboarding avviato.' : 'Accettazione registrata.');
      };
      if (file) {
        uploadFileReale(file, p.clienteId, nomeCliente(p.clienteId), sottocartellaArea('documenti', null, 'Preventivi')).then(fine).catch(err => { console.error('Upload firmato non riuscito:', err.message); fine(null); toast('Accettazione registrata, ma il file non è stato caricato: ' + err.message, true); });
      } else fine(null);
      break;
    }
    case 'prev-riga-aggiungi': { const c = document.getElementById('righePreventivo'); if (c) c.insertAdjacentHTML('beforeend', rigaPreventivoHtml()); break; }
    case 'prev-riga-rimuovi': { const r = el.closest('.riga-prev'); const c = document.getElementById('righePreventivo'); if (r && c) { if (c.children.length > 1) r.remove(); else { r.querySelector('.riga-prev-desc').value = ''; r.querySelector('.riga-prev-importo').value = ''; } aggiornaTotalePreventivoSemplice(); } break; }
    case 'prev-form-completo': { const m = document.querySelector('.modal'); const cid = h('pCliente') ? h('pCliente').value : (m ? m.dataset.clienteAttuale : null); const bl = m && m.dataset.clienteBloccato === '1'; PREV_FORM_COMPLETO = true; modalPreventivo(null, cid, false, null, bl); PREV_FORM_COMPLETO = false; break; }
    case 'salva-preventivo-semplice': {
      const m = document.querySelector('.modal');
      const clienteId = h('pCliente') ? h('pCliente').value : (m ? m.dataset.clienteAttuale : null);
      const oggetto = h('pOggetto').value.trim();
      const righe = Array.from(document.querySelectorAll('.riga-prev')).map(r => ({ nome: r.querySelector('.riga-prev-desc').value.trim(), prezzo: r.querySelector('.riga-prev-importo').value === '' ? null : Number(r.querySelector('.riga-prev-importo').value), id: r.dataset.idCatalogo || uid('att'), richiedeMandato: r.dataset.richiedeMandato === '1' })).filter(r => r.nome);
      if (!clienteId || !oggetto) { toast('Indica cliente e oggetto.', true); return; }
      if (!righe.length) { toast('Inserisci almeno un\'attività.', true); return; }
      const totale = righe.reduce((x, r) => x + (r.prezzo || 0), 0);
      const pag = h('pPagamento').value;
      const fmt2 = (n) => fmtEuro(n);
      let condizioni;
      if (pag === 'unica') condizioni = `Pagamento in unica soluzione: ${fmt2(totale)} + C.P. alla firma del mandato professionale.`;
      else if (pag === '5050') condizioni = `1° acconto (50%): ${fmt2(totale / 2)} + C.P. alla firma del mandato professionale.\n2° saldo (50%): ${fmt2(totale / 2)} + C.P. al completamento delle attività.`;
      else condizioni = h('pPagamentoLibero').value.trim();
      const dataEmissione = h('pDataEmissione').value || oggiISO();
      const gg = Number(h('pValiditaGiorni').value) || 15;
      const vf = new Date(dataEmissione + 'T00:00:00'); vf.setDate(vf.getDate() + gg);
      const modelloId = h('pModelloSemplice').value;
      creaPreventivoDaModello({ clienteId, modelloId, oggetto, importo: totale, dataEmissione, validoFino: vf.toISOString().slice(0, 10), stato: 'Bozza', note: '', valoriCustom: { condizioniPagamento: condizioni, dettaglioAttivita: testoElencoAttivita(righe) }, attivitaScelte: righe, pagamentoModo: pag });
      chiudiModal(); render(); toast('Preventivo creato.');
      break;
    }
    case 'nuovo-potenziale-apri': modalNuovoPotenziale(); break;
    case 'nuovo-potenziale-salva': {
      const nome = h('potNome').value.trim();
      if (!nome) { toast('Inserisci il nome o la ragione sociale.'); return; }
      const PREV_MAP = { 'INPS artigiani / commercianti': 'Artigiani/Commercianti', 'Gestione separata INPS': 'Gestione Separata', 'Cassa privata': 'Cassa Privata', 'Nessuna': 'No previdenza' };
      const dati = { ragioneSociale: nome, codiceFiscale: h('potCf').value.trim(), partitaIva: h('potPiva').value.trim(), contatti: { email: h('potEmail').value.trim(), emailAmministrazione: '', pec: '', telefono: h('potTel').value.trim(), indirizzo: '', cap: '', localita: '', provincia: '' } };
      if (h('potTipo').value) dati.tipo = h('potTipo').value;
      if (h('potRegime').value) dati.regimeFiscale = h('potRegime').value;
      if (h('potPrev').value) dati.previdenza = PREV_MAP[h('potPrev').value] || 'No previdenza';
      const at = h('potAteco').value.trim(); if (at) dati.atecoCodici = at.split(/[,;\s]+/).filter(Boolean);
      dati.flags = { inail: !!h('potInail').checked };
      dati.haDipendenti = h('potDip').checked ? 'SI' : 'NO';
      const c = creaClientePotenziale(dati);
      const appSel = h('potAppuntamento') ? h('potAppuntamento').value : '';
      if (appSel) aggiornaAppuntamento(appSel, { clientePotenzialeId: c.id });
      chiudiModal(); render();
      modalPreventivo(null, c.id, false, null, true);
      break;
    }
    case 'preventivo-esporta-rtf': esportaPreventivoRtf(id); break;
    case 'preventivo-rigenera': {
      const p = STATE.preventivi.find(x => x.id === id);
      if (!p) return;
      const modello = STATE.modelliDocumento.find(m => m.id === p.modelloId);
      if (!modello) { toast('Il modello originale non è più disponibile.'); return; }
      if (!confermaAzione('Rigenerare il testo dal modello? Eventuali modifiche manuali al testo andranno perse.')) return;
      const valoriRiservati = { oggetto: p.oggetto || '', importo: p.importo != null ? fmtNum2(p.importo) : '', dataEmissione: fmtData(p.dataEmissione), validoFino: p.validoFino ? fmtData(p.validoFino) : '' };
      const nuovoCorpo = risolviTemplateDocumento(modello.corpo, p.clienteId, Object.assign({}, valoriRiservati, p.valoriCustom || {}));
      aggiornaPreventivo(id, { corpo: nuovoCorpo });
      modalDettaglioPreventivo(id);
      toast('Testo rigenerato dal modello.');
      break;
    }
    case 'preventivo-salva-testo': {
      const ta = document.getElementById('prevAnteprimaCorpo');
      if (!ta) return;
      aggiornaPreventivo(id, { corpo: editorDocumentoToTesto(ta) });
      potaImmaginiDocumenti(); salvaStato();
      toast('Testo del documento salvato.');
      break;
    }
    case 'preventivo-stampa': apriStampaPreventivo(id); break;
    case 'preventivo-esporta': esportaPreventivoFile(id); break;
    case 'vai-modelli': setView('modelli'); break;

    case 'nuovo-socio': modalSocio(null); break;
    case 'modifica-socio': modalSocio(id); break;
    case 'elimina-socio':
      if (confermaAzione('Eliminare questo socio/referente?')) { eliminaSocio(id); render(); toast('Socio/referente eliminato.'); }
      break;
    case 'salva-socio': {
      const nome = h('sNome').value.trim();
      const ruolo = h('sRuolo').value.trim();
      const codiceFiscale = h('sCodiceFiscale').value.trim().toUpperCase();
      const email = h('sEmail').value.trim();
      const telefono = h('sTelefono').value.trim();
      const note = h('sNote').value.trim();
      const clienteIds = Array.from(document.querySelectorAll('[data-multi-cliente="socio"]:checked')).map(cb => cb.value);
      if (!nome) { toast('Il nome è obbligatorio.'); return; }
      const datiSocio = { nome, ruolo, codiceFiscale, email, telefono, note, clienteIds };
      if (id) aggiornaSocio(id, datiSocio); else aggiungiSocio(datiSocio);
      chiudiModal(); render(); toast(id ? 'Socio/referente aggiornato.' : 'Socio/referente salvato.');
      break;
    }

    case 'ann-toggle-expand':
      if (ANN_EXPANDED.has(id)) ANN_EXPANDED.delete(id); else ANN_EXPANDED.add(id);
      render();
      break;

    case 'nuovo-task-team': modalTaskTeam(null, el.dataset.cliente || null); break;

    case 'cessa-cliente-apri': modalCessazioneCliente(id); break;
    case 'cessa-cliente-conferma': { const faiTask = !!(h('cessRinuncia') && h('cessRinuncia').checked); try { cessaCliente(id, { data: h('cessData').value, motivo: h('cessMotivo').value, nota: h('cessNota').value, ceduti: Array.from(document.querySelectorAll('.cess-ceduto:checked')).map(x => x.dataset.id) }); } catch (err) { toast(err.message, true); return; }
      if (faiTask) { const cc = clienteById(id); aggiungiTaskTeam({ titolo: `Inviare comunicazione scritta di cessazione/rinuncia: ${cc.ragioneSociale}`, assegnatoA: cc.responsabileStudio || null, clienteId: id, scadenza: cc.dataCessazione, stato: STATI_TASK_TEAM[0], noteStorico: [{ id: uid('nota'), testo: 'La rinuncia/cessazione va comunicata per iscritto e in tempo utile. Usa il modello "Lettera di rinuncia / cessazione dell\'incarico".', autore: operatoreCorrente() || null, data: oggiISO() }], creatoIl: oggiISO() }); }
      chiudiModal(); render(); toast('Cliente cessato.'); break; }
    case 'riattiva-cliente': if (confermaAzione('Riattivare questo cliente? Tornerà a generare le scadenze.')) { riattivaCliente(id); render(); toast('Cliente riattivato.'); } break;
    case 'contab-terzi-salva-fasi': {
      const k = el.dataset.chiave; const t = document.getElementById('ctFasi_' + k); if (!t) break;
      const cfg = configContabTerzi(); cfg.sotto[k] = t.value.split('\n').map(x => x.trim()).filter(Boolean);
      salvaConfigContabTerzi(cfg); toast('Fasi salvate.'); break;
    }
    case 'contab-terzi-ripristina': if (confermaAzione('Ripristinare i valori di partenza?')) { STATE.meta.contabTerzi = null; salvaStato(); render(); } break;
    case 'schcli-apri-onboarding': setView('onboarding', { clienteId: el.dataset.cliente }); break;
    case 'schcli-apri-aml': setView('antiriciclaggio', { clienteId: el.dataset.cliente }); break;
    case 'schcli-apri-scadenze':
      SCAD_FILTRO.q = nomeCliente(el.dataset.cliente);
      setView('scadenze', { filtro: el.dataset.filtro });
      break;
    case 'schcli-apri-task': TASK_FILTRO.cliente = el.dataset.cliente; setView('taskteam'); break;
    case 'schcli-apri-comunicazioni': COM_FILTRO.cliente = el.dataset.cliente; setView('comunicazioni'); break;
    case 'schcli-apri-contabilita': CONTAB_CLIENTE = el.dataset.cliente; setView('contabilita'); break;
    case 'schcli-apri-bilanci': BILANCIO_CLIENTE = el.dataset.cliente; setView('bilanci'); break;
    case 'schcli-apri-documenti': DOC_FILTRO.cliente = el.dataset.cliente; setView('documenti'); break;
    case 'schcli-apri-portale': PORTAL_CLIENTE = el.dataset.cliente; setView('portale'); break;
    case 'apri-dettaglio-task-team': modalDettaglioTaskTeam(id); break;
    case 'modifica-task-team': modalTaskTeam(id); break;
    // Task #186: "Segna tutti come visti" spegne anche le eliminazioni in sospeso nello stesso
    // banner, non solo le modifiche/creazioni - altrimenti il banner non si svuoterebbe mai del
    // tutto cliccando quel bottone quando è presente anche una riga di eliminazione.
    case 'task-segna-tutti-visti':
      taskTeamNonVistiPerOperatore().forEach(t => { t.notificaVista = true; });
      STATE.notificheEliminazioni = (STATE.notificheEliminazioni || []).filter(n => !(n.tipo === 'task' && n.destinatario === operatoreCorrente()));
      salvaStato(); render(); break;
    case 'app-segna-tutti-visti':
      appuntamentiNonVistiPerConsulente().forEach(a => { a.notificaVista = true; });
      STATE.notificheEliminazioni = (STATE.notificheEliminazioni || []).filter(n => !(n.tipo === 'appuntamento' && n.destinatario === operatoreCorrente()));
      salvaStato(); render(); break;
    case 'elimina-notifica-eliminazione': segnaNotificaEliminazioneVista(el.dataset.id); render(); break;
    case 'elimina-task-team':
      if (confermaAzione('Eliminare questo task?')) { eliminaTaskTeam(id); chiudiModal(); render(); toast('Task eliminato.'); }
      break;
    case 'salva-task-team': {
      const editing = el.dataset.editing === '1';
      const titolo = h('tTitolo').value.trim();
      const assegnatoA = h('tAssegnato').value;
      const clienteId = h('tCliente').value || null;
      const scadenza = h('tScadenza').value || null;
      const stato = h('tStato').value;
      const procedureId = h('tProcedura').value || null;
      const descrizione = h('tDescrizione').value || '';
      const stampaVerbale = !!h('tStampaVerbale').checked, stampaSezione = h('tStampaSezione').value;
      if (!titolo || !assegnatoA) { toast('Inserisci almeno titolo e assegnatario.'); return; }
      const pratica = !!(h('tPratica') && h('tPratica').checked);
      const filePratica = pratica && h('tPraticaFile') ? Array.from(h('tPraticaFile').files || []) : [];
      if (pratica && !clienteId) { toast('Una pratica deve avere un cliente: scegli il cliente del task.', true); return; }
      const esistente = editing ? STATE.taskTeam.find(x => x.id === id) : null;
      // La cartella si fissa alla prima volta che il task diventa pratica (data = quel giorno); cambiando cliente se ne crea una nuova.
      const cartellaServe = pratica && (!esistente || !esistente.praticaCartella || esistente.praticaClienteId !== clienteId);
      const campiPratica = pratica
        ? { pratica: true, praticaCartella: cartellaServe ? (esistente && esistente.praticaCartella ? esistente.praticaCartella : nomeCartellaPratica(oggiISO(), titolo)) : esistente.praticaCartella }
        : { pratica: false };
      let taskIdPratica = id;
      if (editing) {
        // Le note (storico) in modifica si gestiscono SOLO con "Aggiungi nota" (append immediato,
        // vedi sotto): qui non tocchiamo noteStorico, così Salva non può mai sovrascrivere/perdere
        // lo storico. procedureId e descrizione invece sono campi "semplici" (task #155),
        // sovrascrivibili come titolo/scadenza/stato.
        aggiornaTaskTeam(id, Object.assign({ titolo, assegnatoA, clienteId, scadenza, stato, procedureId, descrizione, stampaVerbale, stampaSezione }, campiPratica));
      } else {
        // In creazione l'unica nota possibile è quella "iniziale" nel campo tNuovaNota: diventa la
        // prima voce dello storico, attribuita a chi sta creando il task in questo momento.
        const notaIniziale = (h('tNuovaNota').value || '').trim();
        const noteStorico = notaIniziale ? [{ id: uid('nota'), testo: notaIniziale, autore: operatoreCorrente() || null, data: oggiISO() }] : [];
        taskIdPratica = aggiungiTaskTeam(Object.assign({ titolo, assegnatoA, clienteId, scadenza, stato, noteStorico, procedureId, descrizione, stampaVerbale, stampaSezione, statoDal: oggiISO(), creatoIl: oggiISO() }, campiPratica)).id;
      }
      chiudiModal(); render(); toast(editing ? 'Task aggiornato.' : 'Task creato.');
      if (pratica && (cartellaServe || filePratica.length)) sincronizzaPratica(taskIdPratica, filePratica);
      if (stampaVerbale && stato === 'Fatto') toast('Verbale da stampare: lo trovi in Libri sociali.');
      break;
    }
    case 'task-nota-modifica': NOTA_IN_MODIFICA = { taskId: id, notaId: el.dataset.nota }; riapriTaskConBozza(id); break;
    case 'task-nota-modifica-annulla': NOTA_IN_MODIFICA = null; riapriTaskConBozza(id); break;
    case 'task-nota-modifica-salva': {
      const ok = modificaNotaTaskTeam(id, el.dataset.nota, (h('tNotaModifica') || {}).value);
      NOTA_IN_MODIFICA = null; render(); riapriTaskConBozza(id);
      toast(ok ? 'Nota modificata (la versione precedente resta nello storico).' : 'Nessuna modifica alla nota.');
      break;
    }
    case 'task-nota-elimina':
      if (confermaAzione('Eliminare questa nota?')) { eliminaNotaTaskTeam(id, el.dataset.nota); render(); riapriTaskConBozza(id); toast('Nota eliminata.'); }
      break;
    case 'task-vedi-procedura-selezionata': {
      const sel = h('tProcedura');
      const pid = sel ? sel.value : '';
      if (!pid) { toast('Seleziona prima una procedura.', true); return; }
      // si salva la bozza di ciò che è stato compilato: il task (nuovo o in modifica) non è ancora salvato
      // e tornando "Indietro" deve ritrovarsi com'era, non vuoto o con i dati vecchi
      TASK_BOZZA = { id: id || null, campi: {} };
      ['tTitolo', 'tAssegnato', 'tCliente', 'tScadenza', 'tStato', 'tProcedura', 'tDescrizione', 'tNuovaNota'].forEach(k => { const f = h(k); if (f) TASK_BOZZA.campi[k] = f.value; });
      if (h('tPratica')) TASK_BOZZA.campi.tPratica = h('tPratica').checked ? '1' : '0';
      modalDettaglioProcedura(pid, { task: id || '__nuovo__' });
      break;
    }
    case 'task-aggiungi-nota': {
      const campo = h('tNuovaNota');
      const testo = campo ? campo.value : '';
      if (!testo.trim()) { toast('Scrivi qualcosa prima di aggiungere la nota.', true); return; }
      aggiungiNotaTaskTeam(id, testo);
      render();
      riapriTaskConBozza(id, ['tNuovaNota']); // riapre il modale sullo stesso task: mostra la nota appena aggiunta, libera il campo e non perde le altre modifiche in corso
      toast('Nota aggiunta.');
      break;
    }

    case 'onboard-seleziona': ONBOARD_SELECTED = id; render(); break;

    case 'aml-seleziona': AML_SELECTED = id; render(); break;
    case 'aml-valutazione-apri': modalValutazioneAml(AML_SELECTED); break;
    case 'aml-val-conferma': {
      const r = confermaValutazioneAml(); if (!r) break;
      chiudiModal(); render();
      toast(`Valutazione registrata: ${r.esito.grado}. Documenti generati in bozza (${[r.risultato.mandatoId && 'mandato', r.risultato.dichiarazioneId && 'dichiarazione AML', r.risultato.notaId && 'nota di accettazione'].filter(Boolean).join(', ') || 'nessuno: manca un modello attivo'}).`);
      break;
    }
    case 'aml-aggiungi-nota': {
      const campo = h('amlNuovaNota');
      const testo = campo ? campo.value : '';
      if (!testo.trim()) { toast('Scrivi qualcosa prima di aggiungere la verifica.', true); return; }
      aggiungiNotaAntiriciclaggio(id, testo);
      render();
      toast('Verifica registrata nello storico.');
      break;
    }

    case 'portal-schermo-intero': PORTAL_DESKTOP_TAB = 'panoramica'; apriAnteprimaPortaleSchermoIntero(); break;
    /* Cambio schermata (Panoramica/Comunicazioni/Scadenze/Documenti/Andamento) dentro l'anteprima
       desktop a schermo intero: ricostruisce l'intero modale (barra + corpo) così la voce di
       navigazione attiva si aggiorna insieme al contenuto. */
    case 'portal-desktop-tab': PORTAL_DESKTOP_TAB = el.dataset.tab; apriAnteprimaPortaleSchermoIntero(); break;
    case 'toggle-sensibili-portale': toggleNascondiSensibiliPortale(); break;
    /* Accesso portale reale (task #87): a differenza delle azioni "simulate" subito sotto (che
       agiscono nell'ANTEPRIMA interna), queste toccano davvero cliente.portaleToken - vedi
       attivaPortaleCliente/disattivaPortaleCliente e la card cardAccessoPortaleReale. */
    case 'portale-attiva-accesso':
      attivaPortaleCliente(id);
      render();
      toast('Accesso portale attivato: copia il link qui sotto e mandalo al cliente.');
      break;
    case 'portale-rigenera-link':
      if (confermaAzione('Rigenerare il link? Quello attuale smette di funzionare subito: chi lo avesse salvato non potrà più accedere finché non gli mandi il nuovo.')) {
        attivaPortaleCliente(id);
        render();
        toast('Nuovo link generato: il precedente non è più valido.');
      }
      break;
    case 'portale-disattiva-accesso':
      if (confermaAzione('Disattivare l\'accesso al portale per questo cliente? Il link smette subito di funzionare.')) {
        disattivaPortaleCliente(id);
        render();
        toast('Accesso portale disattivato.');
      }
      break;
    case 'portale-copia-link':
      copiaTestoNegliAppunti(el.dataset.link);
      break;
    case 'portale-password-salva': {
      const c = clienteById(id);
      if (!c) return;
      const valore = (Object.prototype.hasOwnProperty.call(PORTALE_PASSWORD_DRAFT, id) ? PORTALE_PASSWORD_DRAFT[id] : (h('portPassword_' + id) || {}).value || '').trim();
      if (!valore) { toast('Scrivi una password prima di salvare (o usa "Rimuovi" per toglierla).'); return; }
      c.portalePassword = valore;
      delete PORTALE_PASSWORD_DRAFT[id];
      salvaStato(); render();
      toast('Password del portale salvata.');
      break;
    }
    case 'portale-password-rimuovi': {
      const c = clienteById(id);
      if (!c) return;
      if (confermaAzione(`Rimuovere la password del portale di ${c.ragioneSociale}? Il link da solo tornerà a bastare per accedere.`)) {
        c.portalePassword = null;
        delete PORTALE_PASSWORD_DRAFT[id];
        salvaStato(); render();
        toast('Password del portale rimossa.');
      }
      break;
    }
    case 'accp-nuovo': {
      const nome = window.prompt('Nome di questo accesso (es. "Amministrazione"):');
      if (nome && nome.trim()) {
        nuovoAccessoSecondarioPortale(el.dataset.cliente, nome.trim());
        render();
        toast('Accesso creato: scegli le sezioni visibili e copia il link.');
      }
      break;
    }
    case 'accp-rigenera':
      if (confermaAzione('Rigenerare il link di questo accesso? Quello attuale smette di funzionare subito.')) {
        rigeneraAccessoSecondarioPortale(el.dataset.cliente, el.dataset.accesso);
        render();
        toast('Nuovo link generato.');
      }
      break;
    case 'accp-toggle-attivo': {
      const c = clienteById(el.dataset.cliente);
      const a = c && (c.accessiSecondari || []).find(x => x.id === el.dataset.accesso);
      if (!a) return;
      aggiornaAccessoSecondarioPortale(el.dataset.cliente, el.dataset.accesso, { attivo: a.attivo === false });
      render();
      break;
    }
    case 'accp-elimina':
      if (confermaAzione('Eliminare questo accesso? Il link smette subito di funzionare e l\'azione non si può annullare.')) {
        eliminaAccessoSecondarioPortale(el.dataset.cliente, el.dataset.accesso);
        render();
        toast('Accesso eliminato.');
      }
      break;
    case 'accp-toggle-sezione': {
      const c = clienteById(el.dataset.cliente);
      const a = c && (c.accessiSecondari || []).find(x => x.id === el.dataset.accesso);
      if (!a) return;
      if (!Array.isArray(a.tabConsentiti)) a.tabConsentiti = [];
      const sez = el.dataset.sezione;
      const idx = a.tabConsentiti.indexOf(sez);
      if (el.checked && idx === -1) a.tabConsentiti.push(sez);
      else if (!el.checked && idx !== -1) a.tabConsentiti.splice(idx, 1);
      salvaStato();
      break;
    }
    case 'accp-password-salva': {
      const accessoId = el.dataset.accesso;
      const valore = (Object.prototype.hasOwnProperty.call(PORTALE_PASSWORD_DRAFT_SEC, accessoId) ? PORTALE_PASSWORD_DRAFT_SEC[accessoId] : (h('accpPwd_' + accessoId) || {}).value || '').trim();
      if (!valore) { toast('Scrivi una password prima di salvare (o usa "Rimuovi" per toglierla).'); return; }
      aggiornaAccessoSecondarioPortale(el.dataset.cliente, accessoId, { password: valore });
      delete PORTALE_PASSWORD_DRAFT_SEC[accessoId];
      render();
      toast('Password salvata.');
      break;
    }
    case 'accp-password-rimuovi': {
      const accessoId = el.dataset.accesso;
      if (confermaAzione('Rimuovere la password di questo accesso? Il link da solo tornerà a bastare.')) {
        aggiornaAccessoSecondarioPortale(el.dataset.cliente, accessoId, { password: null });
        delete PORTALE_PASSWORD_DRAFT_SEC[accessoId];
        render();
        toast('Password rimossa.');
      }
      break;
    }
    case 'responsabile-password-salva': {
      const nome = el.dataset.nome;
      const valore = (Object.prototype.hasOwnProperty.call(RESPONSABILE_PASSWORD_DRAFT, nome) ? RESPONSABILE_PASSWORD_DRAFT[nome] : (h('respPassword_' + nome) || {}).value || '').trim();
      if (!valore) { toast('Scrivi una password prima di salvare (o usa "Rimuovi" per toglierla).'); return; }
      fetch('/api/responsabili-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, password: valore }) })
        .then(r => r.json()).then(d => {
          if (!d || !d.ok) { toast('Errore nel salvare la password.'); return; }
          delete RESPONSABILE_PASSWORD_DRAFT[nome];
          RESPONSABILI_CON_PASSWORD_CACHE = null;
          render();
          toast(`Password di ${nome} salvata.`);
        }).catch(() => toast('Errore nel salvare la password.'));
      break;
    }
    case 'responsabile-password-rimuovi': {
      const nome = el.dataset.nome;
      if (confermaAzione(`Rimuovere la password di ${nome}? Tornerà a essere un nome libero, senza sessione esclusiva.`)) {
        fetch('/api/responsabili-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, password: '' }) })
          .then(r => r.json()).then(d => {
            if (!d || !d.ok) { toast('Errore nel rimuovere la password.'); return; }
            delete RESPONSABILE_PASSWORD_DRAFT[nome];
            RESPONSABILI_CON_PASSWORD_CACHE = null;
            render();
            toast(`Password di ${nome} rimossa.`);
          }).catch(() => toast('Errore nel rimuovere la password.'));
      }
      break;
    }
    /* NB: 'portal-com-vista'/'portal-com-archivia'/'portal-com-disarchivia' (Segna come letta/
       Archivia/Ripristina) esistevano solo nel mockup "a telefono" dell'anteprima, rimosso col
       task #111 — nessun pulsante li richiama più (il portale reale servito da server.js è in
       sola lettura), quindi i case sono stati tolti insieme al mockup. */

    /* Area cliente interattiva nell'ANTEPRIMA (task #88/#107): stessa idea del portale reale, ma
       simulata dentro il gestionale (messaggioClientePreview/rispostaClientePreview, senza token).
       "ctx" resta 'pd' (anteprima desktop a schermo intero, l'unica rimasta dopo il task #111) -
       il parametro è vestigiale ma non tolto, per non dover riscrivere anche i data-action generati
       da contenutoDesktopPortale solo per questo. */
    case 'portal-preview-chiedi-info': {
      PORTAL_PREVIEW_PREFILL_SCAD = { id: el.dataset.id, nome: el.dataset.nome };
      PORTAL_PREVIEW_RISPOSTA_APERTA = null;
      PORTAL_DESKTOP_TAB = 'comunicazioni';
      render(); aggiornaAnteprimaPortaleSchermoIntero();
      break;
    }
    case 'portal-preview-annulla-prefill': PORTAL_PREVIEW_PREFILL_SCAD = null; render(); aggiornaAnteprimaPortaleSchermoIntero(); break;
    case 'portal-preview-toggle-risposta':
      PORTAL_PREVIEW_RISPOSTA_APERTA = (PORTAL_PREVIEW_RISPOSTA_APERTA === id) ? null : id;
      render(); aggiornaAnteprimaPortaleSchermoIntero();
      break;
    case 'portal-preview-invia-messaggio': {
      const ctx = el.dataset.ctx;
      const clienteId = el.dataset.cliente;
      const campo = document.getElementById(ctx === 'pd' ? 'previewComposePd' : 'previewComposeTel');
      if (!campo || !campo.value.trim()) { toast('Scrivi qualcosa prima di inviare (stai simulando il messaggio del cliente).', true); return; }
      const testo = campo.value;
      const scadRif = PORTAL_PREVIEW_PREFILL_SCAD ? PORTAL_PREVIEW_PREFILL_SCAD.id : null;
      const campoFile = document.getElementById(ctx === 'pd' ? 'previewComposeFilePd' : 'previewComposeFileTel');
      const file = campoFile && campoFile.files && campoFile.files[0];
      const cliente = STATE.clienti.find(c => c.id === clienteId);
      const inviaConAllegato = (fileInfo) => {
        const msg = messaggioClientePreview(clienteId, testo, scadRif, fileInfo);
        if (!msg) { toast('Messaggio non inviato.', true); return; }
        PORTAL_PREVIEW_PREFILL_SCAD = null;
        render(); aggiornaAnteprimaPortaleSchermoIntero();
        toast('Messaggio simulato inviato: comparirà come "Dal cliente" nel thread Comunicazioni dello studio.');
      };
      if (file && cliente) {
        uploadFileReale(file, clienteId, cliente.ragioneSociale, sottocartellaArea('documenti', null, 'Dal cliente'))
          .then(esito => inviaConAllegato({ percorso: esito.percorso, nomeFile: esito.nomeFile, dimensione: esito.dimensione }))
          .catch(err => { toast('Allegato non caricato: ' + err.message, true); });
      } else {
        inviaConAllegato(null);
      }
      break;
    }
    case 'portal-preview-invia-risposta': {
      const ctx = el.dataset.ctx;
      const clienteId = el.dataset.cliente;
      const campo = document.getElementById((ctx === 'pd' ? 'previewRispostaPd_' : 'previewRispostaTel_') + id);
      if (!campo || !campo.value.trim()) { toast('Scrivi qualcosa prima di rispondere (stai simulando la risposta del cliente).', true); return; }
      const testo = campo.value;
      const campoFile = document.getElementById((ctx === 'pd' ? 'previewRispostaFilePd_' : 'previewRispostaFileTel_') + id);
      const file = campoFile && campoFile.files && campoFile.files[0];
      const cliente = STATE.clienti.find(c => c.id === clienteId);
      const inviaConAllegato = (fileInfo) => {
        const esito = rispostaClientePreview(clienteId, id, testo, fileInfo);
        if (!esito) { toast('Risposta non inviata.', true); return; }
        PORTAL_PREVIEW_RISPOSTA_APERTA = null;
        render(); aggiornaAnteprimaPortaleSchermoIntero();
        toast('Risposta simulata inviata.');
      };
      if (file && cliente) {
        uploadFileReale(file, clienteId, cliente.ragioneSociale, sottocartellaArea('documenti', null, 'Dal cliente'))
          .then(esito => inviaConAllegato({ percorso: esito.percorso, nomeFile: esito.nomeFile, dimensione: esito.dimensione }))
          .catch(err => { toast('Allegato non caricato: ' + err.message, true); });
      } else {
        inviaConAllegato(null);
      }
      break;
    }

    case 'scarica-template-bilancio': scaricaTemplateBilancio(); break;
    case 'scarica-template-clienti': scaricaTemplateClienti(); break;
    case 'elimina-bilancio-anno':
      if (confermaAzione(`Eliminare i dati di bilancio per ${etichettaEstesaBilancio(el.dataset.anno)}?`)) {
        eliminaBilancioAnno(el.dataset.cliente, el.dataset.anno); render(); toast('Dati di bilancio eliminati.');
      }
      break;
    case 'salva-import-bilancio': {
      if (!IMPORT_BILANCIO) { chiudiModal(); break; }
      const { clienteId, piano } = IMPORT_BILANCIO;
      const selects = Array.from(document.querySelectorAll('[data-ribil-voce]'));
      const datiPerPeriodo = {};
      let nRigheImportate = 0;
      selects.forEach(sel => {
        const idx = Number(sel.dataset.idx);
        const chiave = sel.value;
        if (!chiave) return; // "Non importare"
        const riga = piano.righe[idx];
        if (!riga) return;
        nRigheImportate++;
        Object.keys(riga.valori).forEach(periodo => {
          if (!datiPerPeriodo[periodo]) datiPerPeriodo[periodo] = {};
          datiPerPeriodo[periodo][chiave] = (datiPerPeriodo[periodo][chiave] || 0) + riga.valori[periodo];
        });
      });
      const periodiImportati = Object.keys(datiPerPeriodo);
      if (periodiImportati.length === 0 || nRigheImportate === 0) {
        toast('Nessuna riga assegnata a una voce di bilancio: nulla da importare.', true);
        break;
      }
      periodiImportati.forEach(periodo => salvaBilancioAnno(clienteId, periodo, datiPerPeriodo[periodo]));
      IMPORT_BILANCIO = null;
      chiudiModal(); render();
      toast(`Importati ${nRigheImportate} ${nRigheImportate===1?'voce':'voci'} su ${periodiImportati.length} ${periodiImportati.length===1?'periodo':'periodi'}.`);
      break;
    }

    case 'scad-conferma-importo': {
      const inp = el.parentElement && el.parentElement.querySelector('input.importo-input');
      if (inp) salvaImportoScadenza(el.dataset.id, inp, true);
      break;
    }
    case 'scad-apri-solleciti': SCAD_SUBMODAL_DA_DETTAGLIO = false; modalSolleciti(el.dataset.id); break;
    case 'apri-dettaglio-scadenza': modalDettaglioScadenza(id); break;
    case 'apri-dettaglio-appuntamento': apriModalAppuntamento(id); break;
    case 'scad-apri-controllo': SCAD_SUBMODAL_DA_DETTAGLIO = false; modalControlloImposta(el.dataset.id); break;
    // Stesse due sopra, ma raggiunte da dentro modalDettaglioScadenza (task #117): segna il
    // sotto-modale come "aperto dal dettaglio" così può offrire "← Indietro" invece di solo Chiudi.
    case 'scad-detail-apri-solleciti': SCAD_SUBMODAL_DA_DETTAGLIO = true; modalSolleciti(el.dataset.id); break;
    case 'scad-detail-apri-controllo': SCAD_SUBMODAL_DA_DETTAGLIO = true; modalControlloImposta(el.dataset.id); break;
    case 'salva-sollecito': {
      const scadenzaId = el.dataset.id;
      const canale = h('solCanale').value;
      const nota = h('solNota').value;
      inviaSollecitoPortale(scadenzaId, canale, nota);
      modalSolleciti(scadenzaId);
      render();
      toast('Sollecito registrato e inviato nel portale del cliente.');
      break;
    }

    case 'scad-toggle-sel': {
      if (SCAD_SELEZIONATE.has(id)) SCAD_SELEZIONATE.delete(id); else SCAD_SELEZIONATE.add(id);
      render();
      break;
    }
    case 'scad-toggle-sel-pagina': {
      const pag = paginaLista('scadenze', scadenzeFiltrate());
      const tutteSelezionate = pag.pagina.length > 0 && pag.pagina.every(s => SCAD_SELEZIONATE.has(s.id));
      pag.pagina.forEach(s => { if (tutteSelezionate) SCAD_SELEZIONATE.delete(s.id); else SCAD_SELEZIONATE.add(s.id); });
      render();
      break;
    }
    case 'scad-seleziona-tutti-filtrati': {
      scadenzeFiltrate().forEach(s => SCAD_SELEZIONATE.add(s.id));
      render();
      break;
    }
    case 'scad-bulk-deseleziona': SCAD_SELEZIONATE.clear(); render(); break;
    case 'scad-bulk-stato': {
      const stato = h('scadBulkStato').value;
      if (!stato) { toast('Seleziona prima uno stato da applicare.'); return; }
      const ids = Array.from(SCAD_SELEZIONATE);
      const n = bulkCambiaStatoScadenze(ids, stato);
      SCAD_SELEZIONATE.clear();
      render();
      toast(n === ids.length ? `Avanzamento aggiornato per ${n} scadenze.` : `Avanzamento aggiornato per ${n} scadenze su ${ids.length}: nelle altre "${stato}" non è un avanzamento previsto.`);
      break;
    }
    case 'scad-bulk-resp': {
      const resp = h('scadBulkResp').value;
      if (!resp) { toast('Seleziona prima un responsabile da assegnare.'); return; }
      const ids = Array.from(SCAD_SELEZIONATE);
      bulkCambiaRespScadenze(ids, resp);
      SCAD_SELEZIONATE.clear();
      render();
      toast(`Responsabile assegnato a ${ids.length} scadenze.`);
      break;
    }
    case 'scad-bulk-sollecito': modalSollecitoBulk(); break;
    case 'salva-sollecito-bulk': {
      const canale = h('solBulkCanale').value;
      const nota = h('solBulkNota').value;
      const ids = Array.from(SCAD_SELEZIONATE);
      bulkRegistraSollecitoScadenze(ids, canale, nota);
      SCAD_SELEZIONATE.clear();
      chiudiModal();
      render();
      toast(`Sollecito registrato su ${ids.length} scadenze.`);
      break;
    }

    case 'apri-documento-contabile': apriModalDocumentoContabile(el.dataset.cliente); break;
    case 'salva-documento-contabile': {
      const clienteId = el.dataset.cliente;
      const tipo = h('dcTipo').value;
      const dataRiferimento = h('dcData').value;
      const note = h('dcNote').value;
      if (!tipo || !dataRiferimento) { toast('Indica tipo e data di riferimento.'); return; }
      let contoId = null;
      if (tipo === 'mastrino') {
        const selConto = h('dcConto');
        const valConto = selConto ? selConto.value : '__nuovo__';
        if (valConto === '__nuovo__') {
          const nomeNuovo = h('dcContoNuovo') ? h('dcContoNuovo').value.trim() : '';
          if (!nomeNuovo) { toast('Indica il nome del conto (es. Unicredit, Cassa, Conto ponte retribuzioni...).'); return; }
          contoId = creaContoCliente(clienteId, nomeNuovo).id;
        } else {
          contoId = valConto;
        }
      }
      const inputFileContab = h('dcFile');
      const fileContab = (inputFileContab && inputFileContab.files && inputFileContab.files[0]) || null;
      if (fileContab) {
        const clienteNome = clienteById(clienteId).ragioneSociale;
        uploadFileReale(fileContab, clienteId, clienteNome, sottocartellaArea('contabilita')).then(esito => {
          registraDocumentoContabile(clienteId, tipo, dataRiferimento, note, contoId, esito);
          chiudiModal(); render(); toast('Documento e file caricati.');
        }).catch(err => {
          console.error('Upload file documento contabile non riuscito:', err.message);
          registraDocumentoContabile(clienteId, tipo, dataRiferimento, note, contoId);
          chiudiModal(); render(); toast('Documento registrato, ma il file non è stato caricato: ' + err.message, true);
        });
      } else {
        registraDocumentoContabile(clienteId, tipo, dataRiferimento, note, contoId);
        chiudiModal();
        render();
        toast('Documento registrato.');
      }
      break;
    }
    case 'elimina-documento-contabile':
      if (confermaAzione('Eliminare questo documento?')) { eliminaDocumentoContabile(el.dataset.cliente, id); render(); toast('Documento eliminato.'); }
      break;
    case 'apri-import-contabile': apriImportContabile(el.dataset.cliente); break;
    case 'import-contab-chiudi': chiudiImportContabile(); break;
    case 'import-contab-chiudi-backdrop': if (e.target === el) chiudiImportContabile(); break;
    case 'import-contab-conferma-mapping': {
      const w = IMPORT_WIZARD;
      const campi = CAMPI_IMPORT[w.tipo];
      const mancante = campi.find(c => c.obbligatorio && !w.mapping[c.chiave]);
      if (mancante) { toast(`Indica quale colonna corrisponde a "${mancante.label}".`); return; }
      if (!STATE.importProfili) STATE.importProfili = {};
      STATE.importProfili[w.firma] = { mappingColonne: w.mapping };
      salvaStato();
      procediDopoMapping();
      break;
    }
    case 'import-contab-conferma-classificazione': {
      const w = IMPORT_WIZARD;
      const mancante = w.contiNuovi.find(c => !c.categoria);
      if (mancante) { toast(`Scegli una categoria per "${mancante.conto}".`); return; }
      w.step = 'anteprima';
      renderModalImportContabile();
      break;
    }
    case 'import-contab-conferma-import': {
      const w = IMPORT_WIZARD;
      let esito;
      if (w.tipo === 'movimenti') {
        const classificazioni = {};
        w.contiNuovi.forEach(c => { classificazioni[c.chiave] = c.categoria; });
        esito = elaboraImportMovimenti(w.clienteId, w.righeMappate, classificazioni);
      } else {
        esito = elaboraImportFatture(w.clienteId, w.tipo, w.righeMappate);
      }
      w.esito = esito;
      w.step = 'fatto';
      renderModalImportContabile();
      break;
    }

    case 'cal-prev': CAL_MESE = (CAL_MESE + 11) % 12; render(); break;
    case 'cal-next': CAL_MESE = (CAL_MESE + 1) % 12; render(); break;
    case 'cal-oggi': CAL_MESE = new Date().getMonth(); render(); break;
    case 'cal-espandi-giorno': apriModalGiornoCalendario(el.dataset.data); break;
    case 'cal-nuovo-evento': apriModalNuovoEvento(el.dataset.data); break;
    case 'nuovo-evento-tipo': NUOVO_EVENTO_TIPO = el.dataset.tipo; renderFormNuovoEvento(CAL_NUOVO_EVENTO_DATA); break;
    case 'nuovo-evento-salva-appuntamento': salvaNuovoAppuntamento(el.dataset.data); break;
    case 'nuovo-evento-salva-scadenza': salvaNuovaScadenzaRicorrente(); break;
    case 'stampa-riepilogo-appuntamento': apriRiepilogoAppuntamento(id); break;
    case 'app-foglio-completa': {
      const a = trovaAppuntamento(id); if (!a) break; const f = a.foglio || {};
      const mancanti = [!f.tipo && 'posizione da aprire', !f.regimeFiscale && 'regime fiscale', !f.posizioneContributiva && 'posizione contributiva'].filter(Boolean);
      if (mancanti.length) { toast('Mancano ancora: ' + mancanti.join(', ') + '.', true); break; }
      aggiornaAppuntamento(id, { foglio: Object.assign({}, f, { completato: true, completatoDa: operatoreCorrente() || null, completatoIl: oggiISO() }) });
      apriModalAppuntamento(id); toast('Foglio consegnato alla segreteria.'); break;
    }
    case 'app-foglio-riapri': { const a = trovaAppuntamento(id); if (!a) break; aggiornaAppuntamento(id, { foglio: Object.assign({}, a.foglio || {}, { completato: false }) }); apriModalAppuntamento(id); break; }
    case 'prenota-appuntamento': modalPrenotaAppuntamento(); break;
    // Bug segnalato da Matteo ("le frecce per cambiare settimana non fanno nulla"): questi tre sono
    // <button>, quindi un click su di loro non genera MAI un evento 'change' - erano finiti per
    // sbaglio dentro onChangeDelegato (corretto per i <select>/<input> lì sotto, es.
    // prenota-cambia-consulente) invece che qui in onClickDelegato, quindi il listener giusto
    // (document.body 'change') non li vedeva mai scattare.
    case 'prenota-settimana-prec': PRENOTA_SETTIMANA_OFFSET--; aggiornaAgendaSettimanalePrenota(); break;
    case 'prenota-settimana-succ': PRENOTA_SETTIMANA_OFFSET++; aggiornaAgendaSettimanalePrenota(); break;
    case 'prenota-settimana-oggi': PRENOTA_SETTIMANA_OFFSET = 0; aggiornaAgendaSettimanalePrenota(); break;
    case 'salva-prenota-appuntamento': salvaPrenotaAppuntamento(); break;
    case 'app-elimina': if (confermaAzione('Eliminare questo appuntamento?')) { rimuoviAppuntamento(id); chiudiModal(); render(); } break;
    case 'cal-toggle-gruppo': {
      const chiave = el.dataset.chiave;
      if (CAL_GRUPPI_ESPANSI.has(chiave)) CAL_GRUPPI_ESPANSI.delete(chiave); else CAL_GRUPPI_ESPANSI.add(chiave);
      apriModalGiornoCalendario(chiave.split('::')[0]);
      break;
    }

    case 'salva-studio-nome':
      STATE.meta.studioNome = h('impStudioNome').value.trim() || 'Studio';
      STATE.meta.iscrizione = h('impStudioIscrizione').value.trim();
      STATE.meta.cfStudio = h('impStudioCf').value.trim();
      STATE.meta.indirizzoStudio = h('impStudioIndirizzo').value.trim();
      STATE.meta.citta = h('impStudioCitta').value.trim() || 'Vicenza';
      STATE.meta.pecStudio = h('impStudioPec').value.trim();
      STATE.meta.emailStudio = h('impStudioEmail').value.trim();
      STATE.meta.telefonoStudio = h('impStudioTelefono').value.trim();
      STATE.meta.polizzaRc = h('impStudioPolizza').value.trim();
      salvaStato(); render(); toast('Dati studio salvati.');
      break;
    case 'rimuovi-logo-studio':
      STATE.meta.logoStudio = '';
      salvaStato(); render(); toast('Logo rimosso.');
      break;
    case 'aggiungi-responsabile': {
      const nome = window.prompt('Nome del nuovo responsabile:');
      if (nome && nome.trim()) { STATE.meta.responsabili.push(nome.trim()); salvaStato(); render(); }
      break;
    }
    case 'elimina-responsabile': {
      const idx = Number(el.dataset.idx);
      const nomeRimosso = STATE.meta.responsabili[idx];
      STATE.meta.responsabili.splice(idx, 1);
      /* Ripulisce anche meta.consulenti se il responsabile eliminato era un consulente,
         altrimenti resterebbe un nome "fantasma" nell'elenco dei consulenti prenotabili. */
      if (Array.isArray(STATE.meta.consulenti)) {
        const ic = STATE.meta.consulenti.indexOf(nomeRimosso);
        if (ic !== -1) STATE.meta.consulenti.splice(ic, 1);
      }
      // Task #156: stessa pulizia per ruolo/tab consentiti, altrimenti resterebbero voci "fantasma"
      // legate a un nome che in Impostazioni non esiste più.
      if (STATE.meta.ruoli) delete STATE.meta.ruoli[nomeRimosso];
      if (STATE.meta.tabConsentiti) delete STATE.meta.tabConsentiti[nomeRimosso];
      // Ripulisce anche un'eventuale password del referente eliminato (vedi cardPasswordResponsabili):
      // altrimenti resterebbe orfana sul server, legata a un nome che in Impostazioni non esiste più.
      if (HTTP_SYNC_ATTIVO && responsabileHaPassword(nomeRimosso)) {
        fetch('/api/responsabili-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: nomeRimosso, password: '' }) })
          .then(() => { RESPONSABILI_CON_PASSWORD_CACHE = null; }).catch(() => {});
      }
      salvaStato(); render();
      break;
    }
    case 'toggle-consulente': {
      const idx = Number(el.dataset.idx);
      const nome = STATE.meta.responsabili[idx];
      if (!Array.isArray(STATE.meta.consulenti)) STATE.meta.consulenti = [];
      const ic = STATE.meta.consulenti.indexOf(nome);
      if (el.checked) { if (ic === -1) STATE.meta.consulenti.push(nome); }
      else { if (ic !== -1) STATE.meta.consulenti.splice(ic, 1); }
      salvaStato();
      break;
    }
    case 'toggle-tab-consentito': {
      // Task #156: checklist delle sezioni visibili per un responsabile "limitato".
      const resp = el.dataset.resp, tab = el.dataset.tab;
      if (!STATE.meta.tabConsentiti) STATE.meta.tabConsentiti = {};
      if (!Array.isArray(STATE.meta.tabConsentiti[resp])) STATE.meta.tabConsentiti[resp] = [];
      const arr = STATE.meta.tabConsentiti[resp];
      const idxTab = arr.indexOf(tab);
      if (el.checked) { if (idxTab === -1) arr.push(tab); }
      else { if (idxTab !== -1) arr.splice(idxTab, 1); }
      salvaStato();
      render(); // se il referente modificato è l'operatore corrente, la nav va aggiornata subito
      break;
    }
    case 'esporta-backup': esportaBackup(); break;
    case 'aggiungi-anno-gestito': {
      const val = h('impNuovoAnno').value;
      const anno = Number(val);
      if (!val || !Number.isInteger(anno) || anno < 2000 || anno > 2100) { toast('Inserisci un anno valido (es. 2028).'); break; }
      aggiungiAnnoGestito(anno);
      render();
      toast(`Annualità ${anno} aggiunta al selettore in alto.`);
      break;
    }
    case 'rimuovi-anno-gestito': {
      const anno = Number(el.dataset.anno);
      rimuoviAnnoGestito(anno);
      if (STATE.annoCorrente === anno) STATE.annoCorrente = new Date().getFullYear();
      render();
      break;
    }
    case 'esporta-dati-anno': {
      const anno = Number(h('impAnnoTarget').value);
      esportaDatiAnno(anno);
      break;
    }
    case 'elimina-dati-anno': {
      const anno = Number(h('impAnnoTarget').value);
      eliminaDatiAnno(anno);
      break;
    }
    case 'strumenti-converti': avviaConversione(); break;
    case 'strumenti-reset': resetStrumentiFile(); break;
    case 'strumenti-scarica': scaricaRisultatoConversione(); break;
    case 'strumenti-salva-cartella': salvaRisultatoNellaCartellaOriginaria(); break;

    case 'pdfu-sposta-su': spostaFileUnisciPdf(Number(el.dataset.idx), -1); break;
    case 'pdfu-sposta-giu': spostaFileUnisciPdf(Number(el.dataset.idx), 1); break;
    case 'pdfu-rimuovi': rimuoviFileUnisciPdf(Number(el.dataset.idx)); break;
    case 'pdfu-unisci': avviaUnionePdf(); break;
    case 'pdfu-reset': resetPdfUnisci(); break;
    case 'pdfu-scarica': scaricaRisultatoUnionePdf(); break;
    case 'pdfu-salva-cartella': salvaUnionePdfNellaCartella(); break;

    case 'pdfd-dividi': avviaDivisionePdf(); break;
    case 'pdfd-reset': resetPdfDividi(); break;
    case 'pdfd-scarica': scaricaRisultatoDivisionePdf(); break;
    case 'pdfd-salva-cartella': salvaDivisionePdfNellaCartella(); break;

    case 'rubrica-copia': copiaTestoNegliAppunti(el.dataset.testo, 'Contatto copiato negli appunti.'); break;

    case 'nuova-credenziale': modalCredenziale(null); break;
    case 'modifica-credenziale': modalCredenziale(id); break;
    case 'elimina-credenziale':
      if (confermaAzione('Eliminare questa credenziale? L\'operazione non è reversibile.')) { eliminaCredenziale(id); render(); toast('Credenziale eliminata.'); }
      break;
    case 'salva-credenziale': {
      const titolo = h('credTitolo').value.trim();
      if (!titolo) { toast('Il titolo è obbligatorio.'); return; }
      // Righe lasciate completamente vuote (né nome né valore) vengono scartate al salvataggio —
      // capita facilmente con "+ Aggiungi campo" seguito da un ripensamento, senza dover per forza
      // premere anche "Rimuovi". Se dopo lo scarto non resta nessun campo, se ne salva comunque uno
      // vuoto: una credenziale senza nessun campo sarebbe un risultato spiazzante, non intenzionale.
      let campi = CRED_CAMPI_MODAL.filter(c => (c.etichetta && c.etichetta.trim()) || (c.valore && c.valore.trim()))
        .map(c => ({ id: c.id, etichetta: c.etichetta.trim() || 'Campo', valore: c.valore, segreto: !!c.segreto }));
      if (campi.length === 0) campi = [{ id: uid('campo'), etichetta: 'Password', valore: '', segreto: true }];
      const dati = {
        titolo,
        categoria: h('credCategoria').value.trim(),
        clienteId: h('credCliente').value || null,
        campi,
        url: h('credUrl').value.trim(),
        note: h('credNote').value.trim(),
      };
      if (id) aggiornaCredenziale(id, dati); else aggiungiCredenziale(dati);
      chiudiModal(); render(); toast(id ? 'Credenziale aggiornata.' : 'Credenziale salvata.');
      break;
    }
    case 'cred-campo-aggiungi': CRED_CAMPI_MODAL.push(nuovoCampoCredenzialeModal(true)); renderCampiCredenzialeModal(); break;
    case 'cred-campo-rimuovi': CRED_CAMPI_MODAL.splice(Number(el.dataset.idx), 1); renderCampiCredenzialeModal(); break;
    case 'cred-campo-genera': {
      const idx = Number(el.dataset.idx);
      if (CRED_CAMPI_MODAL[idx]) { CRED_CAMPI_MODAL[idx].valore = generaPasswordCasuale(); renderCampiCredenzialeModal(); }
      break;
    }
    case 'cred-mostra-campo': {
      const chiave = id + '::' + el.dataset.campo;
      if (CRED_VISIBILI.has(chiave)) CRED_VISIBILI.delete(chiave); else CRED_VISIBILI.add(chiave);
      render();
      break;
    }
    case 'cred-copia-campo': {
      const c = STATE.credenziali.find(x => x.id === id);
      const campo = c && (c.campi || []).find(cc => cc.id === el.dataset.campo);
      if (campo && campo.valore) copiaTestoNegliAppunti(campo.valore, `${campo.etichetta || 'Valore'} copiato negli appunti.`);
      break;
    }

    case 'ripristina-backup-server': ripristinaBackupServer(el.dataset.file); break;
    case 'backup-esterno-salva':
    case 'backup-esterno-ora': {
      const cartella = (h('backupEsternoCartella') || {}).value;
      const salva = action === 'backup-esterno-salva';
      fetch(salva ? '/api/backup/esterno' : '/api/backup/esterno-ora', salva ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cartella: (cartella || '').trim() }) } : { method: 'POST' })
        .then(r => r.json())
        .then(d => {
          BACKUP_ESTERNO = null; render();
          if (d.ok) toast(salva && !(cartella || '').trim() ? 'Copia esterna disattivata.' : 'Copia esterna eseguita.');
          else toast('⚠ ' + (d.errore || 'Copia non riuscita.'), true);
        })
        .catch(() => toast('Non sono riuscito a contattare il server.', true));
      break;
    }
    case 'ripristina-documenti-mancanti':
      if (!confermaAzione('Recuperare i documenti dei clienti mancanti dallo specchio di backup? I file già presenti non vengono toccati.')) return;
      fetch('/api/backup/ripristina-documenti', { method: 'POST' }).then(r => r.json())
        .then(d => toast(d.ok ? (d.ripristinati ? d.ripristinati + ' documenti recuperati.' : 'Nessun documento mancante: è tutto a posto.') : '⚠ ' + (d.errore || 'Ripristino non riuscito.'), !d.ok))
        .catch(() => toast('Non sono riuscito a contattare il server.', true));
      break;
    case 'ripristina-backup-piattaforma': ripristinaBackupPiattaforma(el.dataset.timestamp); break;
    case 'esporta-mcp': esportaMCP(); break;
    case 'imp-versione-tap': {
      IMP_TAP_VERSIONE = (Date.now() - IMP_TAP_TS > 2500) ? 1 : IMP_TAP_VERSIONE + 1; IMP_TAP_TS = Date.now();
      if (IMP_TAP_VERSIONE >= 7) { IMP_TAP_VERSIONE = 0; const on = !modalitaSviluppatore(); impostaModalitaSviluppatore(on); toast(on ? 'Modalità sviluppatore attivata su questo PC.' : 'Modalità sviluppatore disattivata.'); render(); }
      break;
    }
    case 'dev-disattiva': impostaModalitaSviluppatore(false); IMP_SEZIONE = 'studio'; toast('Modalità sviluppatore disattivata.'); render(); break;
    case 'ia-collegamento': apriModalIaCollegamento(); break;
    case 'ia-copia': { const i = document.getElementById(el.dataset.src); if (i && i.value) copiaTestoNegliAppunti(i.value, 'Copiato negli appunti.'); else toast('Niente da copiare.'); break; }
    case 'ia-nuovo-token': nuovoTokenIa(); break;
    case 'lan-mostra-password': ACCESSO_LAN_VISIBILE = !ACCESSO_LAN_VISIBILE; render(); break;
    case 'lan-cambia-password': { const v = (h('lanNuovaPassword') || {}).value || ''; azioneAccessoLan('password', { password: v }, 'Password cambiata: tutti i dispositivi dovranno rientrare con la nuova.'); break; }
    case 'lan-revoca': azioneAccessoLan('revoca', { id: el.dataset.id }, 'Dispositivo revocato.'); break;
    case 'lan-revoca-tutti': if (confirm('Disconnettere tutti i dispositivi? Dovranno rientrare con la password dello studio.')) azioneAccessoLan('revoca', { tutti: true }, 'Tutti i dispositivi sono stati disconnessi.'); break;
    case 'verifica-aggiornamenti': verificaAggiornamenti(); break;
    case 'applica-aggiornamento': applicaAggiornamentoConferma(); break;
    case 'riavvia-server': {
      const online = Object.keys(PRESENZA_ONLINE || {}).filter(n => n !== operatoreCorrente());
      const avviso = online.length
        ? `Attenzione: risultano online anche ${online.join(', ')}. Riceveranno 60 secondi di preavviso per salvare eventuale lavoro in corso, poi il server si riavvia comunque. Continuare?`
        : 'Riavviare il server ora? Chi ha il gestionale aperto verrà avvisato con 60 secondi di preavviso.';
      if (!confermaAzione(avviso)) return;
      fetch('/api/server/riavvia', { method: 'POST' })
        .then(r => r.json())
        .then(() => toast('Riavvio avviato: tra 60 secondi il server si chiude e si riavvia da solo. Se dopo qualche secondo in più la pagina non torna a funzionare (ricaricala), va riavviato a mano.'))
        .catch(() => toast('Non sono riuscito a contattare il server per il riavvio.', true));
      break;
    }
    case 'conferma-riavvio-server': confermaVistaRiavvioServer(); break;
    case 'rifiuta-riavvio-server': rifiutaRiavvioServer(); break;
    case 'carica-demo':
      if (confermaAzione('Aggiunge clienti ed esempi di prova ai dati attuali. Continuare?')) {
        const demo = generaDatiEsempio();
        STATE.clienti = STATE.clienti.concat(demo.clienti);
        STATE.ritenuteRighe = STATE.ritenuteRighe.concat(demo.ritenuteRighe);
        Object.assign(STATE.onboarding, demo.onboarding);
        Object.assign(STATE.antiriciclaggio, demo.antiriciclaggio || {});
        Object.assign(STATE.scadenzeOverrides, demo.scadenzeOverrides);
        Object.assign(STATE.annualiOverrides, demo.annualiOverrides || {});
        STATE.comunicazioni = STATE.comunicazioni.concat(demo.comunicazioni || []);
        STATE.comunicazioniRicorrenti = (STATE.comunicazioniRicorrenti || []).concat(demo.comunicazioniRicorrenti || []);
        STATE.documenti = STATE.documenti.concat(demo.documenti || []);
        STATE.taskTeam = (STATE.taskTeam || []).concat(demo.taskTeam || []);
        STATE.preventivi = (STATE.preventivi || []).concat(demo.preventivi || []);
        Object.assign(STATE.bilanci, demo.bilanci || {});
        if (!STATE.contoMappings) STATE.contoMappings = {};
        if (!STATE.movimentiContabili) STATE.movimentiContabili = {};
        if (!STATE.fattureContabili) STATE.fattureContabili = {};
        Object.assign(STATE.contoMappings, demo.contoMappings || {});
        Object.assign(STATE.movimentiContabili, demo.movimentiContabili || {});
        Object.assign(STATE.fattureContabili, demo.fattureContabili || {});
        if (!STATE.documentiContabili) STATE.documentiContabili = {};
        Object.assign(STATE.documentiContabili, demo.documentiContabili || {});
        if (!STATE.contiCliente) STATE.contiCliente = {};
        Object.assign(STATE.contiCliente, demo.contiCliente || {});
        STATE.annoCorrente = demo.annoCorrente;
        salvaStato(); render(); toast('Dati di esempio caricati.');
      }
      break;
    case 'reset-tutto':
      // TRE conferme di fila, anche se esistono i backup: lo svuotamento non si annulla.
      if (confermaAzione('Cancella TUTTI i dati salvati in questo browser. Operazione irreversibile. Continuare?', { titolo: 'SVUOTA TUTTI I DATI (1 di 3)', conferma: 'Continua', annulla: 'Annulla' })
        && confermaAzione('Seconda conferma: verranno cancellati clienti, scadenze, documenti, comunicazioni, F24, incassi, bilanci e tutto il resto.\nUn backup recente ti salva, ma tutto ciò che è stato inserito dopo l\'ultimo backup andrà perso.', { titolo: 'SVUOTA TUTTI I DATI (2 di 3)', conferma: 'Sì, voglio proseguire', annulla: 'No, fermati' })
        && confermaAzione('ULTIMA conferma: premendo "Cancella tutto" i dati vengono azzerati subito e non c\'è modo di tornare indietro. Procedo?', { titolo: 'SVUOTA TUTTI I DATI (3 di 3)', conferma: 'Cancella tutto', annulla: 'No, tieni i dati', pericolo: true })) {
        STATE = statoIniziale();
        salvaStato(); render(); toast('Tutti i dati sono stati azzerati.');
      }
      break;

    /* -------- catalogo scadenze periodiche -------- */
    case 'cat-per-expand':
      if (CAT_PER_EXPANDED.has(el.dataset.tipo)) CAT_PER_EXPANDED.delete(el.dataset.tipo); else CAT_PER_EXPANDED.add(el.dataset.tipo);
      render();
      break;
    case 'cat-per-aggiungi-occ':
      aggiungiOccorrenzaPeriodica(el.dataset.tipo);
      CAT_PER_EXPANDED.add(el.dataset.tipo);
      render();
      break;
    case 'cat-per-rimuovi-occ':
      rimuoviOccorrenzaPeriodica(el.dataset.tipo, Number(el.dataset.idx));
      CAT_PER_EXPANDED.add(el.dataset.tipo);
      render();
      break;
    case 'cat-per-elimina-tipo':
      if (confermaAzione('Eliminare definitivamente questo tipo di scadenza personalizzata?')) {
        rimuoviTipoPeriodicoCustom(el.dataset.tipo); render(); toast('Tipo eliminato.');
      }
      break;
    case 'cat-per-nuovo-tipo':
      aggiungiTipoPeriodicoCustom();
      break;
    case 'cat-per-reset':
      if (confermaAzione('Ripristinare il catalogo scadenze periodiche ai valori predefiniti? Le modifiche manuali e i tipi personalizzati andranno persi.')) {
        ripristinaCatalogoPeriodico(); render(); toast('Catalogo ripristinato.');
      }
      break;

    /* -------- catalogo adempimenti annuali -------- */
    case 'cat-ann-expand':
      if (CAT_ANN_EXPANDED.has(el.dataset.tipo)) CAT_ANN_EXPANDED.delete(el.dataset.tipo); else CAT_ANN_EXPANDED.add(el.dataset.tipo);
      render();
      break;
    case 'fasi-sposta': {
      const { target, tipo } = el.dataset; const i = Number(el.dataset.idx), j = i + Number(el.dataset.dir);
      const f = leggiFasiTarget(target, tipo); if (j < 0 || j >= f.length) break;
      [f[i], f[j]] = [f[j], f[i]]; scriviFasiTarget(target, tipo, f); render(); break;
    }
    case 'fasi-rimuovi': {
      const { target, tipo } = el.dataset; const f = leggiFasiTarget(target, tipo);
      if (f.length <= 1) { toast('Serve almeno una fase.', true); break; }
      f.splice(Number(el.dataset.idx), 1); scriviFasiTarget(target, tipo, f); render(); break;
    }
    case 'fasi-aggiungi': {
      const { target, tipo } = el.dataset; const box = document.getElementById('fasiNuove_' + target + '_' + tipo);
      const nuove = (box ? box.value : '').split('\n').map(x => x.trim()).filter(Boolean);
      if (!nuove.length) { toast('Scrivi almeno una fase.', true); break; }
      const f = leggiFasiTarget(target, tipo); let saltate = 0;
      nuove.forEach(n => { if (f.includes(n)) saltate++; else f.push(n); });
      scriviFasiTarget(target, tipo, f); render();
      if (saltate) toast(saltate + (saltate === 1 ? ' fase già presente non aggiunta' : ' fasi già presenti non aggiunte') + ' (i nomi devono essere diversi).', true);
      break;
    }
    case 'fasi-ripristina-standard': {
      const def = DEFAULT_CATALOGO_ANNUALE.find(d => d.chiave === el.dataset.tipo);
      if (def && confermaAzione('Ripristinare le fasi predefinite di questo adempimento? Le tue modifiche alle fasi andranno perse.')) { scriviFasiTarget('catalogo', def.chiave, def.sotto.slice()); render(); toast('Fasi ripristinate.'); }
      break;
    }
    case 'fasi-terzi-expand': if (TERZI_FASI_EXPANDED.has(el.dataset.tipo)) TERZI_FASI_EXPANDED.delete(el.dataset.tipo); else TERZI_FASI_EXPANDED.add(el.dataset.tipo); render(); break;
    case 'fasi-terzi-personalizza': {
      const t = trovaTipoAnnuale(el.dataset.tipo); if (!t) break;
      scriviFasiTarget('terzi', t.chiave, t.sotto.slice()); TERZI_FASI_EXPANDED.add(t.chiave); render(); break;
    }
    case 'fasi-terzi-standard': {
      if (!confermaAzione('Tornare alle fasi standard per i clienti con contabilità da terzi?')) break;
      const cfg = configContabTerzi(); delete cfg.sotto[el.dataset.tipo]; salvaConfigContabTerzi(cfg); render(); break;
    }
    case 'cat-ann-aggiungi-sotto':
      aggiungiSottoAnnualeCatalogo(el.dataset.tipo);
      CAT_ANN_EXPANDED.add(el.dataset.tipo);
      render();
      break;
    case 'cat-ann-rimuovi-sotto':
      rimuoviSottoAnnualeCatalogo(el.dataset.tipo, Number(el.dataset.idx));
      CAT_ANN_EXPANDED.add(el.dataset.tipo);
      render();
      break;
    case 'cat-ann-elimina-tipo':
      if (confermaAzione('Eliminare definitivamente questo adempimento annuale personalizzato?')) {
        rimuoviTipoAnnualeCustom(el.dataset.tipo); render(); toast('Tipo eliminato.');
      }
      break;
    case 'cat-ann-nuovo-tipo':
      aggiungiTipoAnnualeCustom();
      break;
    case 'cat-ann-reset':
      if (confermaAzione('Ripristinare il catalogo adempimenti annuali ai valori predefiniti? Le modifiche manuali e i tipi personalizzati andranno persi.')) {
        ripristinaCatalogoAnnuale(); render(); toast('Catalogo ripristinato.');
      }
      break;

    case 'scad-aggiungi-annotazione': {
      const campo = h('scadNuovaAnnotazione');
      if (!campo || !campo.value.trim()) { toast('Scrivi qualcosa prima di aggiungere l\'annotazione.', true); return; }
      aggiungiAnnotazioneScadenza(id, campo.value);
      modalControlloImposta(id);
      render();
      break;
    }
    case 'scad-elimina-annotazione':
      eliminaAnnotazioneScadenza(id, el.dataset.annotazioneId);
      modalControlloImposta(id);
      render();
      break;
  }
}

function onChangeDelegato(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const id = el.dataset.id;

  switch (action) {
    case 'task-pratica-toggle': {
      const box = h('tPraticaBox'); if (box) box.style.display = el.checked ? 'block' : 'none';
      const lbl = h('tPraticaCartella');
      if (el.checked && lbl && !lbl.dataset.fissa) { const tt = h('tTitolo'); lbl.textContent = nomeCartellaPratica(oggiISO(), (tt && tt.value.trim()) || 'nome pratica'); }
      break;
    }
    case 'scad-filtro-data-da-picker': SCAD_FILTRO.dataDa = el.value || ''; resetPagina('scadenze'); render(); break;
    case 'scad-filtro-data-a-picker': SCAD_FILTRO.dataA = el.value || ''; resetPagina('scadenze'); render(); break;
    case 'scad-cambia-importo': salvaImportoScadenza(id, el); break; // all'uscita dal campo: salva e formatta (1.234,56)
    // Task #173/#199: interruttore "avvia ngrok automaticamente a ogni avvio di Prisma" - un
    // booleano unico ora che clienti e collaboratori condividono la stessa porta/lo stesso tunnel.
    case 'ngrok-autoavvio-toggle': {
      const attivo = el.checked;
      fetch('/api/ngrok-autoavvio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ngrokAutoavvio: attivo }),
      }).then(r => r.json()).then(d => {
        if (!d.ok) { toast('Non sono riuscito a salvare la preferenza.', true); el.checked = !attivo; return; }
        if (ACCESSO_ESTERNO_CACHE && ACCESSO_ESTERNO_CACHE !== 'errore') ACCESSO_ESTERNO_CACHE.ngrokAutoavvio = d.ngrokAutoavvio;
        toast(attivo ? 'ngrok si avvierà da solo ad ogni avvio di Prisma.' : 'Avvio automatico di ngrok disattivato.');
      }).catch(() => { toast('Non sono riuscito a contattare il server locale.', true); el.checked = !attivo; });
      break;
    }
    // Task #176: riattiva/sospende il tab Contabilità nel menu - vedi operatorePuoVedere() per il
    // blocco centrale e statoIniziale() per il default (sospeso) su nuove installazioni/salvataggi
    // vecchi senza questo campo. Nessuna chiamata server: è un flag dentro STATE.meta, salvato come
    // tutto il resto di Impostazioni > Studio al prossimo giro di salvaStato().
    case 'toggle-contabilita-attiva':
      STATE.meta.contabilitaAttiva = el.checked;
      salvaStato();
      render();
      toast(el.checked ? 'Tab Contabilità riattivato.' : 'Tab Contabilità sospeso: resta nel menu solo se lo riattivi da qui, i dati restano tutti salvati.');
      break;
    // Task #214: accende/spegne un modulo - vedi MODULI/operatorePuoVedere. Solo flag in STATE.meta.
    // Selettore orario nativo (icona orologio): copia l'orario scelto nel campo di testo e lo "cambia"
    // come se l'avessi digitato, così vale per qualunque azione agganciata a quel campo.
    case 'orario-picker-scelto': {
      const campo = document.getElementById(el.dataset.target);
      if (!campo || !el.value) break;
      campo.value = el.value;
      campo.dispatchEvent(new Event('change', { bubbles: true }));
      break;
    }
    case 'toggle-modulo': {
      const id = el.dataset.modulo;
      if (!MODULI.some(m => m.id === id)) break;
      if (!Array.isArray(STATE.meta.moduliDisattivati)) STATE.meta.moduliDisattivati = [];
      const arr = STATE.meta.moduliDisattivati;
      const i = arr.indexOf(id);
      if (el.checked && i !== -1) arr.splice(i, 1);
      else if (!el.checked && i === -1) arr.push(id);
      salvaStato();
      render();
      break;
    }
    case 'toggle-mcp-conferma': STATE.meta.mcpChiediConferma = !!el.checked; salvaStato(); toast(el.checked ? 'Ogni azione di Claude richiederà la tua conferma.' : 'Le azioni di Claude vengono eseguite senza conferma (restano nel registro).'); break;
    case 'doc-img-file': caricaImmagineNelDocumento(el.files && el.files[0]); el.value = ''; break;
    case 'contab-terzi-periodico': {
      const cfg = configContabTerzi(); const set = new Set(cfg.periodiciEsclusi);
      if (el.checked) set.delete(el.dataset.id); else set.add(el.dataset.id);
      cfg.periodiciEsclusi = Array.from(set); salvaConfigContabTerzi(cfg); break;
    }
    case 'report-mensile-mese': { const t = h('rmTesto'); if (t) t.value = reportMensileCliente(el.dataset.cliente, el.value || oggiISO().slice(0, 7)); break; }
    case 'cpb-stato': STATE.cpb[id] = Object.assign({}, STATE.cpb[id] || {}, { stato: el.value }); salvaStato(); render(); break;
    case 'cpb-nota': STATE.cpb[id] = Object.assign({}, STATE.cpb[id] || {}, { nota: el.value }); salvaStato(); break;
    case 'deon-acc-cliente': DEON_CLIENTE = el.value; render(); break;
    case 'deon-acc-toggle': { aggiornaAccettazione(DEON_CLIENTE, { voci: { [el.dataset.k]: el.checked } }); if (accettazioneCompleta(DEON_CLIENTE)) aggiornaAccettazione(DEON_CLIENTE, { data: oggiISO() }); else aggiornaAccettazione(DEON_CLIENTE, { data: null }); render(); break; }
    case 'deon-acc-forte': aggiornaAccettazione(DEON_CLIENTE, { clienteForte: el.checked, data: null }); render(); break;
    case 'deon-acc-note': aggiornaAccettazione(DEON_CLIENTE, { note: el.value }); break;
    case 'atto-trascritto': { const d = (STATE.documenti || []).find(x => x.id === el.dataset.id); if (d) { d.trascritto = el.checked; d.trascrittoIl = el.checked ? oggiISO() : null; salvaStato(); render(); } break; }
    case 'libri-filtro-cliente': LIBRI_FILTRO.cliente = el.value; render(); break;
    case 'libri-filtro-tipo': LIBRI_FILTRO.tipo = el.value; render(); break;
    case 'stampa-libro-segna': segnaStampaLibro(el.dataset.key, el.checked); render(); break;
    case 'libro-stato-fisico': aggiornaLibroSociale(el.dataset.id, { statoFisico: el.value }); render(); break;
    case 'libri-stampato-fino': if (el.value) { impostaStampatoFino(el.dataset.cliente, el.value); render(); toast('Stato di stampa aggiornato.'); } break;
    case 'libri-filtro-stato': LIBRI_FILTRO.stato = el.value; render(); break;
    case 'libri-filtro-detentore': LIBRI_FILTRO.detentore = el.value; render(); break;
    case 'fatt-filtro-cliente': FATT_FILTRO.cliente = el.value; render(); break;
    case 'fatt-filtro-vista': FATT_FILTRO.vista = el.value; render(); break;
    case 'inc-filtro-cliente': INC_FILTRO.cliente = el.value; resetPagina('incassi'); render(); break;
    case 'inc-filtro-stato': INC_FILTRO.stato = el.value; resetPagina('incassi'); render(); break;
    case 'import-cli-mappa': if (IMPORT_CLI) { IMPORT_CLI.mappa[el.dataset.chiave] = Number(el.value); renderWizardImportClienti(); } break;
    case 'dash-resp': DASH_RESP = el.value; render(); break;
    case 'cambia-ruolo-responsabile': {
      const resp = el.dataset.resp;
      if (!STATE.meta.ruoli) STATE.meta.ruoli = {};
      if (ruoloOperatore(resp) === 'master' && el.value !== 'master' && (STATE.meta.responsabili || []).filter(r => ruoloOperatore(r) === 'master').length <= 1) {
        toast('Deve esserci almeno un\'utenza maestro.'); render(); break;
      }
      if (el.value === 'admin') delete STATE.meta.ruoli[resp]; // 'admin' è il default implicito, non serve salvarlo
      else STATE.meta.ruoli[resp] = el.value === 'master' ? 'master' : 'limitato';
      salvaStato();
      render(); // se il referente diventa "limitato" ora, la sua nav va filtrata subito se è lui l'operatore corrente
      break;
    }

    case 'cli-filtro-regime': CLI_FILTRO.regime = el.value; resetPagina('clienti'); render(); break;
    case 'cli-filtro-resp': CLI_FILTRO.resp = el.value; resetPagina('clienti'); render(); break;
    case 'cli-filtro-mandatario': CLI_FILTRO.mandatario = el.value; resetPagina('clienti'); render(); break;
    case 'cli-filtro-cessati': CLI_FILTRO.mostraCessati = el.checked; resetPagina('clienti'); render(); break;
    case 'cli-filtro-incompleti': CLI_FILTRO.soloIncompleti = el.checked; if (!el.checked) CLI_FILTRO.soloGravi = false; resetPagina('clienti'); render(); break;
    case 'import-cli-filtro-livello': filtraAnteprimaImportClienti(); break;
    case 'cli-filtro-gravi': CLI_FILTRO.soloGravi = el.checked; resetPagina('clienti'); render(); break;

    case 'cred-filtro-cliente': CRED_FILTRO.cliente = el.value; resetPagina('credenziali'); render(); break;
    case 'strumenti-scegli-formato': STRUMENTI_FORMATO_SCELTO = el.value; render(); break;

    // Attività a listino nel modale Preventivo/Mandato (task #138): ricalcola l'importo dalla
    // somma delle attività selezionate e, se il modello ha un campo "dettaglioAttivita", ci
    // compila anche l'elenco voci — niente render() qui: siamo dentro un form aperto, un redraw
    // completo lo butterebbe via (stesso motivo per cui altri toggle di modale, es. c-f24-toggle,
    // manipolano il DOM direttamente invece di richiamare render()).
    case 'prev-toggle-modulo': {
      const scelti = Array.from(document.querySelectorAll('[data-modulo-prev]:checked')).map(c => (STATE.moduliPreventivo || []).find(x => x.id === c.dataset.id)).filter(Boolean);
      const t = testoModuliPreventivo(scelti);
      const campo = (k) => document.querySelector('[data-campo-custom][data-chiave="' + k + '"]');
      if (campo('elencoModuli')) campo('elencoModuli').value = t.elenco;
      if (campo('richiesta')) campo('richiesta').value = t.richiesta;
      if (scelti.length) { h('pOggetto').value = t.oggetto; if (t.compenso != null) h('pImporto').value = t.compenso.toFixed(2); }
      break;
    }
    case 'prev-toggle-attivita': {
      const scelte = Array.from(document.querySelectorAll('[data-attivita-catalogo]:checked')).map(c => ({
        id: c.dataset.id, nome: c.dataset.nome,
        prezzo: c.dataset.prezzo !== '' ? Number(c.dataset.prezzo) : null,
        richiedeMandato: c.dataset.mandato === '1',
      }));
      if (scelte.length > 0) {
        const somma = scelte.reduce((s, a) => s + (a.prezzo != null ? a.prezzo : 0), 0);
        const campoImporto = h('pImporto');
        if (campoImporto) campoImporto.value = somma.toFixed(2);
      }
      const campoDettaglio = h('campoDettaglioAttivita');
      if (campoDettaglio) campoDettaglio.value = testoElencoAttivita(scelte);
      break;
    }

    case 'scad-filtro-bucket': SCAD_FILTRO.bucket = el.value; resetPagina('scadenze'); render(); break;
    case 'scad-filtro-stato': SCAD_FILTRO.stato = el.value; resetPagina('scadenze'); render(); break;
    case 'scad-filtro-resp': SCAD_FILTRO.resp = el.value; resetPagina('scadenze'); render(); break;
    case 'scad-filtro-tipo': SCAD_FILTRO.tipo = el.value; resetPagina('scadenze'); render(); break;
    case 'scad-cambia-stato': aggiornaScadenza(id, { stato: el.value }); render(); break;
    case 'scad-cambia-resp': aggiornaScadenza(id, { responsabile: el.value }); render(); break;
    // Varianti usate dentro modalDettaglioScadenza (task #110): stessa mutazione di sopra, ma qui
    // il modale resta aperto sopra alla pagina, quindi oltre a render() (la tabella sotto, se
    // visibile) serve ridisegnare ANCHE il modale stesso — es. cambiare stato può impostare in
    // automatico "Completata il", che nel modale è visibile e altrimenti resterebbe non aggiornato.
    case 'scad-detail-cambia-stato': aggiornaScadenza(id, { stato: el.value }); render(); modalDettaglioScadenza(id); break;
    case 'scad-detail-cambia-resp': aggiornaScadenza(id, { responsabile: el.value }); render(); modalDettaglioScadenza(id); break;

    // Modale dettaglio appuntamento (task #141): stato aggiorna anche la vista sotto (badge/colore
    // in calendario), gli altri campi no render — stesso motivo di scad-cambia-importo.
    case 'app-cambia-stato': aggiornaAppuntamento(id, { stato: el.value }); render(); break;
    // Task #171 (Matteo: "metti ora inizio e ora fine, è più pratico"): editare l'ora inizio
    // mantiene la durata attuale (sposta anche la fine con sé, stesso comportamento di trascinare
    // un blocco su Google Calendar); editare l'ora fine mantiene l'inizio fisso e ricalcola solo
    // la durata. Il campo gemello (non toccato) viene aggiornato a mano nel DOM per restare
    // coerente, senza un render() completo del modale (stesso motivo di scad-cambia-importo: si
    // perderebbe il focus su un campo che si sta ancora editando).
    case 'app-cambia-ora-inizio': {
      const nuovoInizio = el.value.trim();
      if (!orarioValido(nuovoInizio)) { toast('Ora inizio non valida: usa il formato HH:MM.', true); break; }
      const prima = trovaAppuntamento(id);
      const durata = prima ? durataAppuntamento(prima) : DURATA_APPUNTAMENTO_DEFAULT;
      aggiornaAppuntamento(id, { ora: nuovoInizio, durataMinuti: durata });
      const dopo = trovaAppuntamento(id);
      const fineEl = h('appOraFine_' + id);
      if (fineEl && dopo) fineEl.value = oraFineAppuntamento(dopo) || '';
      avvisaSeConflittoAppuntamento(id);
      break;
    }
    case 'app-cambia-ora-fine': {
      const a = trovaAppuntamento(id);
      const nuovaFine = el.value.trim();
      if (!a || !a.ora || !orarioValido(nuovaFine)) { toast('Ora fine non valida: usa il formato HH:MM.', true); if (a) el.value = oraFineAppuntamento(a) || ''; break; }
      const durata = durataDaOrari(a.ora, nuovaFine);
      if (durata === null) { toast('L\'ora di fine deve essere successiva all\'ora di inizio.', true); el.value = oraFineAppuntamento(a) || ''; break; }
      aggiornaAppuntamento(id, { durataMinuti: durata });
      avvisaSeConflittoAppuntamento(id);
      break;
    }
    case 'app-cambia-oggetto': aggiornaAppuntamento(id, { oggetto: el.value }); break;
    case 'app-cambia-software-fatturazione': aggiornaAppuntamento(id, { bisognoSoftwareFatturazione: el.value }); break;
    // Task #185: collegamento a procedura come campo libero, sempre modificabile dal consulente -
    // si ri-apre il modale (non solo render()) così il pulsante "Apri" compare/sparisce subito
    // insieme alla select, senza dover chiudere e riaprire a mano.
    case 'app-cambia-procedura': aggiornaAppuntamento(id, { procedureId: el.value || PROC_NESSUNA }); apriModalAppuntamento(id); break;
    case 'app-cambia-note': aggiornaAppuntamento(id, { note: el.value }); break;
    case 'aml-val-prestazione': if (AML_VAL_DRAFT) { AML_VAL_DRAFT.prestazione = Number(el.value); const n = AML_PRESTAZIONI[AML_VAL_DRAFT.prestazione].nome; AML_VAL_DRAFT.sezioneB = !['Tenuta della contabilità', 'Revisione legale dei conti'].includes(n); disegnaModalValutazioneAml(); } break;
    case 'aml-val-sezioneb': if (AML_VAL_DRAFT) { AML_VAL_DRAFT.sezioneB = el.checked; disegnaModalValutazioneAml(); } break;
    case 'aml-val-livello': if (AML_VAL_DRAFT) { const d = (AML_VAL_DRAFT.fattori[el.dataset.k] = AML_VAL_DRAFT.fattori[el.dataset.k] || { checks: [], livello: 1 }); d.livello = Number(el.value); const e = document.getElementById('amlEsito'); if (e) e.innerHTML = esitoAmlHtml(AML_VAL_DRAFT); } break;
    case 'aml-val-fattore': if (AML_VAL_DRAFT) { const d = (AML_VAL_DRAFT.fattori[el.dataset.k] = AML_VAL_DRAFT.fattori[el.dataset.k] || { checks: [], livello: 1 }); d.checks[Number(el.dataset.i)] = el.checked; } break;
    case 'prev-pagamento-cambia': { const w = document.getElementById('pPagamentoLiberoWrap'); if (w) w.style.display = el.value === 'libero' ? '' : 'none'; break; }
    case 'prev-riga-da-catalogo': { const a = (STATE.catalogoAttivitaStudio || []).find(x => x.id === el.value); if (a) { const c = document.getElementById('righePreventivo'); const prima = c.children.length === 1 && !c.querySelector('.riga-prev-desc').value.trim() && c.querySelector('.riga-prev-importo').value === ''; if (prima) c.innerHTML = ''; c.insertAdjacentHTML('beforeend', rigaPreventivoHtml({ id: a.id, nome: a.nome, prezzo: a.prezzo, richiedeMandato: a.richiedeMandato })); aggiornaTotalePreventivoSemplice(); el.value = ''; } break; }
    case 'potenziale-da-appuntamento': modalNuovoPotenziale(el.value || null); break;
    case 'app-foglio-campo': { const a = trovaAppuntamento(id); if (!a) break; const foglio = Object.assign({}, a.foglio || {}); foglio[el.dataset.campo] = el.type === 'checkbox' ? el.checked : el.value; aggiornaAppuntamento(id, { foglio }); break; }
    case 'nuovo-evento-scad-frequenza': aggiornaVisibilitaMeseScadenzaRicorrente(); break;
    case 'prenota-cambia-consulente': PRENOTA_CONSULENTE = el.value; renderFormPrenotaAppuntamento(); break;
    case 'prenota-tipo-change': aggiornaVisibilitaClientePrenota(); break;
    case 'prenota-motivo-change': aggiornaVisibilitaMotivoAltroPrenota(); break;
    case 'cred-campo-toggle-segreto': {
      const idx = Number(el.dataset.idx);
      if (CRED_CAMPI_MODAL[idx]) { CRED_CAMPI_MODAL[idx].segreto = el.checked; renderCampiCredenzialeModal(); }
      break;
    }

    case 'rit770-anno': RIT770_ANNO = Number(el.value); render(); break;
    case 'rit-filtro-cliente': RIT_FILTRO_CLIENTE = el.value; resetPagina('ritenute'); render(); break;
    case 'rit-cambia-stato': {
      const r = STATE.ritenuteRighe.find(x => x.id === id);
      if (r) { r.statoRit = el.value; salvaStato(); render(); }
      break;
    }
    case 'rit-imposta-pagamento': {
      // Il cliente ha pagato la fattura: il placeholder diventa una riga vera e propria e
      // rientra nel calcolo del cumulo/scadenza F24 dal prossimo render (derivati() rilegge
      // sempre STATE.ritenuteRighe da zero, non serve altro).
      if (!el.value) return; // l'utente ha svuotato il date picker senza scegliere una data: non fare nulla
      const r = STATE.ritenuteRighe.find(x => x.id === id);
      if (r) {
        r.dataPagamento = el.value;
        if (r.statoRit === 'In attesa di pagamento') r.statoRit = 'Da pagare';
        salvaStato(); render();
        toast('Data di pagamento impostata: la scadenza F24 è stata generata.');
      }
      break;
    }

    case 'ann-filtro-tipo': ANN_FILTRO.tipo = el.value; resetPagina('annuali'); render(); break;
    case 'ann-filtro-resp': ANN_FILTRO.resp = el.value; resetPagina('annuali'); render(); break;
    case 'ann-filtro-stato': ANN_FILTRO.stato = el.value; resetPagina('annuali'); render(); break;
    case 'ann-non-dovuto': {
      if (el.checked) aggiornaAnnualeMeta(id, { nonDovuto: true, nonDovutoDa: operatoreCorrente() || null, nonDovutoData: oggiISO() });
      else aggiornaAnnualeMeta(id, { nonDovuto: false, nonDovutoDa: null, nonDovutoData: null });
      render(); break;
    }
    case 'ann-scadenza': aggiornaAnnualeMeta(id, { scadenza: el.value || null }); render(); break;
    case 'ann-resp': aggiornaAnnualeMeta(id, { responsabile: el.value }); render(); break;
    case 'ann-toggle-sotto': case 'ann-data-sotto': case 'ann-resp-sotto': {
      const idx = Number(el.dataset.idx);
      const annuale = derivati().annuali.find(a => a.id === id);
      if (!annuale) return;
      const nomeSotto = annuale.sotto[idx].nome;
      if (action === 'ann-toggle-sotto') aggiornaSottoAdempimento(id, nomeSotto, { completato: el.checked });
      if (action === 'ann-data-sotto') aggiornaSottoAdempimento(id, nomeSotto, { data: el.value || null });
      if (action === 'ann-resp-sotto') aggiornaSottoAdempimento(id, nomeSotto, { responsabile: el.value });
      render();
      break;
    }
    case 'onboard-toggle': aggiornaOnboarding(ONBOARD_SELECTED, el.dataset.chiave, el.checked); render(); break;
    case 'onboard-apertura-toggle': { const o = STATE.onboarding[ONBOARD_SELECTED]; const x = o && (o.apertura || []).find(v => v.chiave === el.dataset.chiave); if (x) { x.fatto = el.checked; x.fattoDa = el.checked ? (operatoreCorrente() || null) : null; x.fattoIl = el.checked ? oggiISO() : null; salvaStato(); } render(); break; }

    case 'aml-toggle-checklist': aggiornaChecklistAntiriciclaggio(AML_SELECTED, el.dataset.chiave, el.checked); render(); break;
    case 'aml-cambia-rischio': aggiornaCampoAntiriciclaggio(AML_SELECTED, 'profiloRischio', el.value); render(); break;
    case 'aml-cambia-verifica': aggiornaCampoAntiriciclaggio(AML_SELECTED, 'dataAdeguataVerifica', el.value || null); render(); break;
    case 'aml-cambia-revisione': aggiornaCampoAntiriciclaggio(AML_SELECTED, 'scadenzaRevisione', el.value || null); render(); break;

    // Task #120: l'utente ha scelto una categoria di suo pugno nel modale "Nuovo documento" — da qui
    // in poi il suggerimento (aggiornaSuggerimentoCategoriaDocumento, in onInputDelegato) non deve
    // più sovrascrivere il select mentre l'utente continua a digitare il nome. Nessun render(): è
    // solo un flag sul nodo DOM, il modale resta aperto e invariato.
    case 'doc-categoria-manual': el.dataset.userSet = '1'; break;

    case 'task-filtro-assegnato': TASK_FILTRO.assegnato = el.value; STATI_TASK_TEAM.forEach(s=>resetPagina('taskteam-'+s)); render(); break;
    case 'task-filtro-cliente': TASK_FILTRO.cliente = el.value; STATI_TASK_TEAM.forEach(s=>resetPagina('taskteam-'+s)); render(); break;
    case 'task-filtro-stato': TASK_FILTRO.stato = TASK_FILTRO.stato === el.dataset.stato ? 'Tutti' : el.dataset.stato; STATI_TASK_TEAM.forEach(s=>resetPagina('taskteam-'+s)); render(); break;
    case 'task-filtro-mostra-fatti': TASK_FILTRO.mostraFatti = el.checked; STATI_TASK_TEAM.forEach(s=>resetPagina('taskteam-'+s)); render(); break;
    case 'task-filtro-campo-data': TASK_FILTRO.campoData = el.value; STATI_TASK_TEAM.forEach(s=>resetPagina('taskteam-'+s)); render(); break;
    case 'task-filtro-data-da-picker': TASK_FILTRO.dataDa = el.value || ''; STATI_TASK_TEAM.forEach(s=>resetPagina('taskteam-'+s)); render(); break;
    case 'task-filtro-data-a-picker': TASK_FILTRO.dataA = el.value || ''; STATI_TASK_TEAM.forEach(s=>resetPagina('taskteam-'+s)); render(); break;
    case 'cli-tipo-cambia': { const fs = document.getElementById('fsAssociazione'); if (fs) fs.style.display = el.value === 'associazione' ? '' : 'none'; break; }
    case 'task-cambia-stato': aggiornaTaskTeam(id, { stato: el.value }); render(); { const tt = STATE.taskTeam.find(x => x.id === id); if (tt && tt.stato === 'Fatto' && tt.stampaVerbale) toast('Verbale da stampare: lo trovi in Libri sociali.'); } break;

    case 'chat-rif-filtro-tipo': CHAT_RIF_FILTRO_TIPO = el.value; aggiornaRisultatiRiferimentoChat(); break;
    case 'com-filtro-cliente': COM_FILTRO.cliente = el.value; resetPagina('comunicazioni'); render(); break;
    case 'com-filtro-stato': COM_FILTRO.stato = el.value; resetPagina('comunicazioni'); render(); break;
    case 'com-filtro-categoria': COM_FILTRO.categoria = el.value; resetPagina('comunicazioni'); render(); break;
    case 'com-filtro-direzione': COM_FILTRO.direzione = el.value; resetPagina('comunicazioni'); render(); break;
    case 'com-filtro-chiusura': COM_FILTRO.chiusura = el.value; resetPagina('comunicazioni'); render(); break;
    case 'com-cambia-stato': aggiornaComunicazione(id, { stato: el.value }); render(); break;
    case 'com-cambia-stato-gruppo':
      STATE.comunicazioni.filter(c => c.gruppoId === id).forEach(c => { c.stato = el.value; });
      salvaStato(); render();
      break;
    case 'comric-toggle-attiva': aggiornaComunicazioneRicorrente(id, { attiva: el.checked }); render(); break;
    case 'c-dest-modo': {
      const w1 = document.getElementById('cDestSingoloWrap'), w2 = document.getElementById('cDestMultiWrap');
      if (w1) w1.style.display = el.value === 'singolo' ? '' : 'none';
      if (w2) w2.style.display = el.value === 'multi' ? '' : 'none';
      // Task #105: la sezione F24 ha senso solo per un destinatario singolo (l'importo è specifico
      // di quel cliente) — cambiando modo la nascondiamo e azzeriamo la spunta/i campi, così non
      // resta selezionata "in silenzio" un'F24 legata a un invio broadcast.
      const w3 = document.getElementById('cF24Wrap');
      if (w3) {
        w3.style.display = el.value === 'singolo' ? '' : 'none';
        if (el.value !== 'singolo') {
          const cb = document.getElementById('cIsF24');
          if (cb) cb.checked = false;
          const campi = document.getElementById('cF24Campi');
          if (campi) campi.style.display = 'none';
        }
      }
      break;
    }
    case 'c-f24-toggle': {
      const campi = document.getElementById('cF24Campi');
      if (campi) campi.style.display = el.checked ? '' : 'none';
      break;
    }
    case 'c-categoria-change': {
      const wrap = document.getElementById('cRaccoltaDocWrap');
      if (wrap) wrap.style.display = el.value === 'Raccolta documentale' ? '' : 'none';
      break;
    }
    case 'cr-dest-modo': {
      const w1 = document.getElementById('crDestSingoloWrap'), w2 = document.getElementById('crDestMultiWrap');
      if (w1) w1.style.display = el.value === 'singolo' ? '' : 'none';
      if (w2) w2.style.display = el.value === 'multi' ? '' : 'none';
      break;
    }
    case 'cr-adempimento-change': {
      const valore = el.value;
      const wrapDest = document.getElementById('crDestinatariWrap');
      const wrapInfo = document.getElementById('crAdempimentoInfo');
      const txtInfo = document.getElementById('crAdempimentoInfoTxt');
      if (wrapDest) wrapDest.style.display = valore ? 'none' : '';
      if (wrapInfo) wrapInfo.style.display = valore ? '' : 'none';
      if (txtInfo) txtInfo.textContent = valore ? `Destinatari attuali: ${clientiPerAdempimentoCollegato(valore).length} clienti.` : '';
      break;
    }

    case 'doc-filtro-cliente': DOC_FILTRO.cliente = el.value; resetPagina('documenti'); render(); break;
    case 'doc-filtro-categoria': DOC_FILTRO.categoria = el.value; resetPagina('documenti'); render(); break;
    case 'f24-filtro-cliente': F24_FILTRO.cliente = el.value; resetPagina('f24'); render(); break;
    case 'f24-filtro-tipo': F24_FILTRO.tipo = el.value; resetPagina('f24'); render(); break;
    case 'soci-filtro-cliente': SOCI_FILTRO.cliente = el.value; resetPagina('soci'); render(); break;

    case 'prev-filtro-cliente': PREV_FILTRO.cliente = el.value; resetPagina('preventivi'); render(); break;
    case 'prev-filtro-categoria': PREV_FILTRO.categoria = el.value; resetPagina('preventivi'); render(); break;
    case 'prev-filtro-stato': PREV_FILTRO.stato = el.value; resetPagina('preventivi'); render(); break;
    case 'prev-filtro-potenziali': PREV_FILTRO.soloPotenziali = el.checked; resetPagina('preventivi'); render(); break;
    case 'prev-cambia-stato': {
      const pp = STATE.preventivi.find(x => x.id === id);
      if (pp && pp.categoria === 'Preventivo' && el.value === 'Accettato' && pp.stato !== 'Accettato') { modalAccettazionePreventivo(id); break; }
      aggiornaPreventivo(id, { stato: el.value }); render(); modalDettaglioPreventivo(id); break;
    }
    case 'docm-cambia-cliente': {
      const modalEl = document.querySelector('.modal');
      const soloAml = modalEl.dataset.contestoAml === '1';
      const bloccato = modalEl.dataset.clienteBloccato === '1';
      modalPreventivo(null, el.value, soloAml, null, bloccato);
      break;
    }
    case 'docm-cambia-modello': {
      // Il cliente attualmente scelto va letto dal dataset del modale, non da h('pCliente'): se il
      // documento è bloccato su un cliente specifico (aperto dal fascicolo Antiriciclaggio) quel
      // <select> non esiste nel DOM, e leggerlo darebbe null, perdendo il cliente e facendolo
      // ricadere sul primo della lista al cambio di modello (bug corretto in questa sessione).
      const modalEl = document.querySelector('.modal');
      const soloAml = modalEl.dataset.contestoAml === '1';
      const bloccato = modalEl.dataset.clienteBloccato === '1';
      const clienteCorrente = modalEl.dataset.clienteAttuale || null;
      modalPreventivo(null, clienteCorrente, soloAml, el.value, bloccato);
      break;
    }

    case 'portal-seleziona-cliente': PORTAL_CLIENTE = el.value; render(); aggiornaAnteprimaPortaleSchermoIntero(); break;
    case 'bilancio-seleziona-cliente': BILANCIO_CLIENTE = el.value; render(); break;
    case 'importa-bilancio': importaBilancio(el); break;
    case 'importa-clienti-file': importaClienti(el); break;
    case 'riconc-file': importaEstrattoConto(el); break;
    case 'riconc-spunta': if (RICONC) RICONC.mov[Number(el.dataset.k)].spunta = el.checked; break;
    case 'riconc-incasso': if (RICONC) { const m = RICONC.mov[Number(el.dataset.k)]; m.incassoId = el.value || null; m.livello = el.value ? 'possibile' : 'nessuno'; m.spunta = !!el.value && m.spunta; } break;

    case 'contabilita-seleziona-cliente': CONTAB_CLIENTE = el.value; render(); break;
    case 'schcli-seleziona-cliente': SCHEDA_CLIENTE = el.value; render(); break;
    case 'import-contab-tipo':
      IMPORT_WIZARD.tipo = el.value;
      renderModalImportContabile();
      break;
    case 'import-contab-file': gestisciFileImportContabile(el); break;
    case 'import-contab-mappa-campo':
      IMPORT_WIZARD.mapping[el.dataset.campo] = el.value || null;
      break;
    case 'import-contab-classifica-conto':
      IMPORT_WIZARD.contiNuovi[Number(el.dataset.idx)].categoria = el.value;
      break;

    case 'edit-responsabile': {
      const idx = Number(el.dataset.idx);
      const vecchioNome = STATE.meta.responsabili[idx];
      const nuovoNome = el.value.trim() || vecchioNome;
      STATE.meta.responsabili[idx] = nuovoNome;
      /* Se il responsabile rinominato era un consulente, aggiorna anche il nome in meta.consulenti
         (che è un elenco di stringhe-nome, non di indici, quindi va tenuto sincronizzato). */
      if (nuovoNome !== vecchioNome && Array.isArray(STATE.meta.consulenti)) {
        const ic = STATE.meta.consulenti.indexOf(vecchioNome);
        if (ic !== -1) STATE.meta.consulenti[ic] = nuovoNome;
      }
      // Task #156: stessa sincronizzazione per ruolo/tab consentiti sulla rinomina.
      if (nuovoNome !== vecchioNome) {
        if (STATE.meta.ruoli && vecchioNome in STATE.meta.ruoli) {
          STATE.meta.ruoli[nuovoNome] = STATE.meta.ruoli[vecchioNome];
          delete STATE.meta.ruoli[vecchioNome];
        }
        if (STATE.meta.tabConsentiti && vecchioNome in STATE.meta.tabConsentiti) {
          STATE.meta.tabConsentiti[nuovoNome] = STATE.meta.tabConsentiti[vecchioNome];
          delete STATE.meta.tabConsentiti[vecchioNome];
        }
      }
      // Segue la rinomina anche lato password del referente (vedi endpoint dedicato in server.js),
      // altrimenti la password resterebbe legata al vecchio nome, non più selezionabile in Impostazioni.
      if (nuovoNome !== vecchioNome && HTTP_SYNC_ATTIVO && responsabileHaPassword(vecchioNome)) {
        fetch('/api/responsabili-password-rinomina', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vecchioNome, nuovoNome }) })
          .then(() => { RESPONSABILI_CON_PASSWORD_CACHE = null; render(); }).catch(() => {});
      }
      salvaStato();
      break;
    }
    case 'importa-backup': importaBackup(el); break;
    case 'importa-dati-anno': importaDatiAnno(el); break;
    case 'strumenti-scegli-file': selezionaFileConversione(el); break;
    case 'pdfu-scegli-file': selezionaFileUnisciPdf(el); break;
    case 'pdfd-scegli-file': selezionaFileDividiPdf(el); break;
    case 'pdfd-cambia-da': PDFD_DA = Number(el.value) || 1; break;
    case 'pdfd-cambia-a': PDFD_A = Number(el.value) || 1; break;
    case 'carica-logo-studio': caricaLogoStudio(el); break;
    case 'cambia-posizione-logo': STATE.meta.logoPosizione = el.value; salvaStato(); break;
    case 'meta-pie-pagina': STATE.meta.piePagina = el.value; salvaStato(); break;

    case 'cat-per-con-importo': aggiornaTipoPeriodico(el.dataset.tipo, { conImporto: el.checked }); break;
    case 'cat-per-toggle-attivo': aggiornaTipoPeriodico(el.dataset.tipo, { attivo: el.checked }); render(); break;
    case 'cat-per-mese': aggiornaOccorrenzaPeriodica(el.dataset.tipo, Number(el.dataset.idx), { m: Number(el.value) }); break;
    case 'cat-ann-toggle-attivo': aggiornaTipoAnnuale(el.dataset.tipo, { attivo: el.checked }); render(); break;
  }
}

function onInputDelegato(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const id = el.dataset.id;
  switch (action) {
    case 'task-cerca-procedura': mostraListaProcedureTask(); break;
    case 'prev-riga-importo': aggiornaTotalePreventivoSemplice(); break;
    case 'task-filtro-q': TASK_FILTRO.q = el.value; STATI_TASK_TEAM.forEach(s=>resetPagina('taskteam-'+s)); render(); restoreFocus('[data-action="task-filtro-q"]'); break;
    case 'scad-filtro-data-da': case 'scad-filtro-data-a': case 'task-filtro-data-da': case 'task-filtro-data-a': maschera_data_testo(el); break; // solo formattazione, nessun filtro finche non si esce dal campo
    // Task #171: autoformattazione "mentre si scrive" dei campi orario testuali (inserisce i due
    // punti da solo dopo le prime due cifre) - il salvataggio vero e proprio (dove previsto) è un
    // case separato con lo stesso nome dentro onChangeDelegato, scatenato al blur.
    case 'orario-autoformat': case 'app-cambia-ora-inizio': case 'app-cambia-ora-fine': formattaInputOrario(el); break;
    case 'import-cli-filtro': filtraAnteprimaImportClienti(); break;
    case 'cli-filtro-q': CLI_FILTRO.q = el.value; resetPagina('clienti'); render(); restoreFocus('[data-action="cli-filtro-q"]'); break;
    case 'rubrica-filtro-q': RUBRICA_FILTRO.q = el.value; resetPagina('rubrica'); render(); restoreFocus('[data-action="rubrica-filtro-q"]'); break;
    case 'cred-filtro-q': CRED_FILTRO.q = el.value; resetPagina('credenziali'); render(); restoreFocus('[data-action="cred-filtro-q"]'); break;
    case 'scad-filtro-q': SCAD_FILTRO.q = el.value; resetPagina('scadenze'); render(); restoreFocus('[data-action="scad-filtro-q"]'); break;
    // Ricerca cliente in Onboarding/Antiriciclaggio (Matteo: con 100+ clienti scorrere la colonna
    // a sinistra per trovarne uno era uno spreco di tempo). render() completo (non filtro DOM-only
    // come in altri casi) perché qui, a differenza di una checklist di checkbox, non c'è stato non
    // salvato da perdere — restoreFocus tiene comunque il campo a fuoco dopo il ridisegno.
    case 'onboard-filtro-q': ONBOARD_FILTRO_Q = el.value; render(); restoreFocus('[data-action="onboard-filtro-q"]'); break;
    case 'aml-filtro-q': AML_FILTRO_Q = el.value; render(); restoreFocus('[data-action="aml-filtro-q"]'); break;
    case 'proc-filtro-q': PROC_FILTRO_Q = el.value; render(); restoreFocus('[data-action="proc-filtro-q"]'); break;
    case 'portale-password-campo': PORTALE_PASSWORD_DRAFT[el.dataset.id] = el.value; break;
    case 'acc-cliente-seleziona': ACC_CLIENTE_SEL = el.value; render(); break;
    case 'responsabile-password-campo': RESPONSABILE_PASSWORD_DRAFT[el.dataset.nome] = el.value; break;
    case 'accp-password-campo': PORTALE_PASSWORD_DRAFT_SEC[el.dataset.accesso] = el.value; break;
    case 'accp-rinomina': {
      const nuovoNome = el.value.trim();
      if (nuovoNome) aggiornaAccessoSecondarioPortale(el.dataset.cliente, el.dataset.accesso, { nome: nuovoNome });
      break;
    }
    case 'accesso-esterno-campo': {
      const tipo = el.dataset.tipo, campo = el.dataset.campo;
      if (ACCESSO_ESTERNO_DRAFT && ACCESSO_ESTERNO_DRAFT[tipo]) ACCESSO_ESTERNO_DRAFT[tipo][campo] = el.value;
      aggiornaBottoneAccessoEsterno(tipo); // niente render(): accenderebbe/spegnerebbe il pulsante senza perdere il focus sul campo
      break;
    }
    case 'dc-tipo-change': apriModalDocumentoContabile(el.dataset.cliente, el.value); break;
    case 'f24-chiave-change': aggiornaSuggerimentoImportoF24(); break;
    case 'f24-cliente-change': aggiornaSuggerimentoImportoF24(); break;
    case 'f24-cliente-cerca': F24_CLIENTE_QUERY = el.value; h('fCliente').value = ''; renderRisultatiClienteF24(); break;
    // Task richiesto da Matteo: barra di ricerca nella checklist "Clienti collegati" del modale
    // Socio/referente. Filtro puramente sul DOM (mostra/nasconde le righe già renderizzate),
    // niente render()/STATE: con tanti clienti scorrerli tutti sarebbe scomodo, ma le spunte già
    // fatte non devono mai sparire solo perché si digita nella ricerca - un render() qui
    // ricostruirebbe la lista dal DOM e perderebbe lo stato "checked" non ancora salvato.
    case 'socio-clienti-cerca': {
      const q = el.value.trim().toLowerCase();
      const righe = document.querySelectorAll('#sClientiLista .checkline');
      let visibili = 0;
      righe.forEach(r => {
        const match = !q || (r.dataset.nomeRicerca || '').includes(q);
        r.style.display = match ? '' : 'none';
        if (match) visibili++;
      });
      const vuoto = h('sClientiVuoto');
      if (vuoto) vuoto.style.display = visibili === 0 ? '' : 'none';
      break;
    }
    // Stessa ricerca DOM-only del caso 'socio-clienti-cerca' qui sopra, applicata alla checklist
    // clienti del modale "Nuova scadenza ricorrente" (task #141).
    case 'nuovo-evento-scad-cerca': {
      const q = el.value.trim().toLowerCase();
      const righe = document.querySelectorAll('#nevScadClientiLista .checkline');
      let visibili = 0;
      righe.forEach(r => {
        const match = !q || (r.dataset.nomeRicerca || '').includes(q);
        r.style.display = match ? '' : 'none';
        if (match) visibili++;
      });
      const vuoto = h('nevScadClientiVuoto');
      if (vuoto) vuoto.style.display = visibili === 0 ? '' : 'none';
      break;
    }
    case 'f24-riga-input': {
      const idx = Number(el.dataset.idx);
      const campo = el.dataset.campo;
      if (F24_RIGHE_MODAL[idx]) {
        F24_RIGHE_MODAL[idx][campo] = (campo === 'importo' || campo === 'importoPagato') ? (el.value === '' ? null : el.value) : el.value;
        if (campo === 'importo') { const totEl = h('f24RigheTotale'); if (totEl) totEl.textContent = 'Totale: ' + fmtEuro(F24_RIGHE_MODAL.reduce((s,r)=>s+(Number(r.importo)||0),0)); }
      }
      break;
    }
    case 'cred-campo-input': {
      const idx = Number(el.dataset.idx);
      const campo = el.dataset.campo;
      if (CRED_CAMPI_MODAL[idx]) CRED_CAMPI_MODAL[idx][campo] = el.value; // no render: perderebbe il focus a metà digitazione
      break;
    }
    case 'doc-nome-suggerisci': aggiornaSuggerimentoCategoriaDocumento(); break; // no render: perderebbe il focus a metà nome
    case 'dc-conto-change': {
      const wrap = h('dcContoNuovoWrap');
      if (wrap) wrap.style.display = (el.value === '__nuovo__') ? '' : 'none';
      break;
    }
    case 'ann-nota': aggiornaAnnualeMeta(id, { nota: el.value }); break; // no render: non perdere il focus mentre si scrive
    case 'scad-cambia-nota': aggiornaScadenza(id, { nota: el.value }); break; // no render: non perdere il focus mentre si scrive
    // BUG: qui si salvava (e si RIFORMATTAVA il campo) a ogni tasto: dopo la prima cifra il campo diventava "1,00" e non si riusciva
    // piu a scrivere. Durante la digitazione si lascia il campo in pace e si toglie solo la spunta di conferma; il salvataggio
    // avviene all'uscita dal campo / Invio / tasto ✓ (vedi onChangeDelegato e scad-conferma-importo).
    case 'scad-cambia-importo': { const ok = el.parentElement && el.parentElement.querySelector('button.importo-ok'); if (ok) ok.classList.remove('salvato'); break; }
    case 'proroga-cerca': { const t = el.value.trim().toLowerCase(); document.querySelectorAll('tr[data-prc-riga]').forEach(r => { r.style.display = (!t || r.dataset.prcRiga.includes(t)) ? '' : 'none'; }); break; }
    case 'proroga-conta': prcAggiornaConteggio(); break;
    case 'ann-filtro-q': ANN_FILTRO.q = el.value; resetPagina('annuali'); render(); restoreFocus('[data-action="ann-filtro-q"]'); break;
    case 'ricerca-input': RICERCA_QUERY = el.value; RICERCA_SEL = 0; aggiornaRisultatiRicerca(); break; // niente render(): perderebbe il focus sull'input
    case 'chat-rif-input': CHAT_RIF_QUERY = el.value; aggiornaRisultatiRiferimentoChat(); break; // idem

    case 'cat-per-fasi': { const fasi = el.value.split('\n').map(x => x.trim()).filter(Boolean); aggiornaTipoPeriodico(el.dataset.tipo, { fasi: fasi.length ? fasi : FASI_DEFAULT_CUSTOM.slice() }); break; }
    case 'cat-per-nome': aggiornaTipoPeriodico(el.dataset.tipo, { nome: el.value }); break;
    case 'cat-per-giorno': aggiornaOccorrenzaPeriodica(el.dataset.tipo, Number(el.dataset.idx), { g: Number(el.value) || 1 }); break;
    case 'cat-per-nota': aggiornaOccorrenzaPeriodica(el.dataset.tipo, Number(el.dataset.idx), { nota: el.value }); break;
    case 'cat-ann-nome': aggiornaTipoAnnuale(el.dataset.tipo, { nome: el.value }); break;
    case 'cat-ann-mese': aggiornaScadenzaDefaultAnnuale(el.dataset.tipo, 'm', Number(el.value)); break;
    case 'cat-ann-giorno': aggiornaScadenzaDefaultAnnuale(el.dataset.tipo, 'g', Number(el.value) || 1); break;
    case 'cat-ann-sotto': aggiornaSottoAnnualeCatalogo(el.dataset.tipo, Number(el.dataset.idx), el.value); break;
    case 'fasi-testo': {
      const { target, tipo } = el.dataset; const i = Number(el.dataset.idx); const f = leggiFasiTarget(target, tipo);
      const v = el.value.trim();
      if (!v) { el.value = f[i]; toast('Il nome della fase non può essere vuoto.', true); break; }
      if (f.some((x, k) => k !== i && x === v)) { el.value = f[i]; toast('Esiste già una fase con questo nome.', true); break; }
      f[i] = v; scriviFasiTarget(target, tipo, f); break;
    }
  }
}
// Piccola utility: dopo un render generato da un input di testo, il focus si perde (si ricrea il DOM).
// Lo ripristiniamo sull'elemento con lo stesso data-action e ci mettiamo il cursore in fondo.
function restoreFocus(selector) {
  requestAnimationFrame(() => {
    const el = document.querySelector(selector);
    if (el) { el.focus(); const v = el.value; el.value=''; el.value=v; }
  });
}

/* I filtri data "Scadenza da/a" (renderScadenze) sono volutamente SORDI sia a "input" che a
   "change": un <input type="date"> nativo può emettere "change" non appena l'utente inizia a
   compilare l'ultimo segmento (l'anno) ancora prima che la data sia completa/valida — se in quel
   momento si facesse un render() (che ricrea il campo da zero), il focus si perderebbe a metà
   della digitazione dell'anno e le cifre successive andrebbero perse (bug segnalato da Matteo).
   Si applica il filtro solo quando il campo perde davvero il focus ("focusout", l'equivalente di
   "blur" ma che bubbla, quindi delegabile su document.body come gli altri eventi), quando il
   valore è ormai quello finale: da lì in poi un render() non interrompe più nessuna digitazione. */
function onFocusOutDelegato(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  // render() ricrea i campi: si ricorda dove andava il focus (es. dal campo "da" al campo "a" con Tab) e lo si rimette dopo.
  const prossimo = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('[data-action]') : null;
  const selProssimo = prossimo && /^(INPUT|SELECT|TEXTAREA)$/.test(prossimo.tagName) && prossimo.getAttribute('tabindex') !== '-1' ? `[data-action="${prossimo.dataset.action}"]` : null;
  const applica = (campo) => {
    const iso = parseDataTesto(el.value);
    if (iso === null) { toast('Data non valida: scrivila come gg/mm/aaaa', true); SCAD_FILTRO[campo] = ''; }
    else SCAD_FILTRO[campo] = iso;
    resetPagina('scadenze'); render();
    if (selProssimo) { const n = document.querySelector(selProssimo); if (n) { n.focus(); if (n.select && n.type === 'text') n.select(); } }
  };
  switch (el.dataset.action) {
    case 'task-filtro-data-da': case 'task-filtro-data-a': {
      const campo = el.dataset.action === 'task-filtro-data-da' ? 'dataDa' : 'dataA';
      const iso = parseDataTesto(el.value);
      if (iso === null) { toast('Data non valida: scrivila come gg/mm/aaaa', true); TASK_FILTRO[campo] = ''; } else TASK_FILTRO[campo] = iso;
      STATI_TASK_TEAM.forEach(s=>resetPagina('taskteam-'+s)); render();
      if (selProssimo) { const n = document.querySelector(selProssimo); if (n) { n.focus(); if (n.select && n.type === 'text') n.select(); } }
      break;
    }
    case 'scad-filtro-data-da': applica('dataDa'); break;
    case 'scad-filtro-data-a': applica('dataA'); break;
  }
}

