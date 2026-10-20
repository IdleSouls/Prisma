'use strict';
/* -------------------- RENDER: PROCEDURE INTERNE (task #146) --------------------
   Stesso pattern di renderModelliDocumento/modalModelloDocumento (lista raggruppata per categoria +
   un solo modale creazione/modifica), ma con contenuto libero (niente segnaposto {{così}}: qui è
   testo procedurale, non un documento da compilare) e una checklist di documenti necessari, gestita
   come elenco "un documento per riga" in una textarea dedicata. */
let PROC_FILTRO_Q = '';
function renderProcedureInterne() {
  const tutte = STATE.procedureInterne || [];
  const q = PROC_FILTRO_Q.trim().toLowerCase();
  const procedure = q ? tutte.filter(p => (p.nome + ' ' + p.categoria + ' ' + p.contenuto).toLowerCase().includes(q)) : tutte;
  const intro = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
    <input type="text" placeholder="Cerca per nome, categoria o contenuto..." value="${escapeHtml(PROC_FILTRO_Q)}" data-action="proc-filtro-q" style="flex:1;min-width:220px;max-width:360px;border:1px solid var(--border);border-radius:6px;padding:7px 10px;">
    <button class="btn primary" data-action="nuova-procedura">+ Nuova procedura</button>
  </div>`;
  if (tutte.length === 0) {
    return intro + `<div class="card"><div class="empty"><div class="big">Nessuna procedura ancora</div>Raccogli qui le indicazioni operative per lo staff (es. apertura di una nuova attività, costituzione società): passo per passo, con la checklist dei documenti necessari.</div></div>`;
  }
  if (procedure.length === 0) {
    return intro + `<div class="card"><div class="empty">Nessuna procedura trovata per "${escapeHtml(PROC_FILTRO_Q)}".</div></div>`;
  }
  const categorie = Array.from(new Set(procedure.map(p => p.categoria))).sort((a,b) => a.localeCompare(b));
  const gruppi = categorie.map(cat => {
    const procCat = procedure.filter(p => p.categoria === cat).sort((a,b) => a.nome.localeCompare(b.nome));
    const righe = procCat.map(p => {
      const anteprima = p.contenuto.replace(/\s+/g, ' ').trim();
      const nDoc = (p.checklistDocumenti || []).length;
      return `<div class="card" style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
          <div>
            <div style="font-weight:600;">${escapeHtml(p.nome)} ${!p.attivo?'<span class="badge stato-errore">Disattivata</span>':''}</div>
            <div class="helptext" style="margin-top:4px;">${nDoc} document${nDoc===1?'o necessario':'i necessari'} · ${escapeHtml(anteprima.slice(0,140))}${anteprima.length>140?'…':''}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn small" data-action="apri-procedura" data-id="${p.id}">Apri</button>
            <button class="btn small" data-action="modifica-procedura" data-id="${p.id}">Modifica</button>
            <button class="btn small" data-action="duplica-procedura" data-id="${p.id}">Duplica</button>
            <button class="btn small danger" data-action="elimina-procedura" data-id="${p.id}">Elimina</button>
          </div>
        </div>
      </div>`;
    }).join('');
    return `<div class="section-title" style="margin-top:18px;">${escapeHtml(cat)}</div>${righe}`;
  }).join('');
  return intro + gruppi;
}

/* Vista di sola lettura, pensata per essere aperta velocemente dal consulente prima di un appuntamento
   (vedi task #147): procedura passo-passo + checklist documenti, senza dover passare da "Modifica". */
function modalDettaglioProcedura(id, ritorno) {
  const p = STATE.procedureInterne.find(x => x.id === id);
  if (!p) { toast('Procedura non trovata.'); return; }
  // ritorno = {app:id} o {task:id}: se la procedura è aperta da un appuntamento/task, mostra "← Indietro"
  const btnIndietro = ritorno ? `<button class="btn" data-action="procedura-indietro" ${ritorno.app?`data-app="${ritorno.app}"`:`data-task="${ritorno.task}"`}>← Indietro</button>` : '';
  const checklist = (p.checklistDocumenti || []);
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:700px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>${escapeHtml(p.nome)}</h2><div class="modal-sub">${escapeHtml(p.categoria)}</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <div style="white-space:pre-wrap;line-height:1.6;margin-top:10px;">${escapeHtml(p.contenuto)}</div>
      ${checklist.length ? `<div class="section-title" style="margin-top:16px;">Documenti necessari</div>
        <ul style="margin:6px 0 0 18px;padding:0;">${checklist.map(d => `<li>${escapeHtml(d)}</li>`).join('')}</ul>` : ''}
      <div class="modal-actions">
        ${btnIndietro}
        <button class="btn" data-action="chiudi-modal">Chiudi</button>
        <button class="btn primary" data-action="modifica-procedura" data-id="${p.id}">Modifica</button>
      </div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
}

function procedureById(id) { return (STATE.procedureInterne || []).find(p => p.id === id) || null; }
const CATEGORIE_PROCEDURA_BASE = ['Apertura attività', 'Cessazione attività', 'Consulenza società', 'Adempimenti periodici', 'Amministrazione studio'];
function modalProceduraInterna(id) {
  const editing = id ? STATE.procedureInterne.find(x => x.id === id) : null;
  if (id && !editing) { toast('Procedura non trovata.'); return; }
  const categorieEsistenti = Array.from(new Set(CATEGORIE_PROCEDURA_BASE.concat((STATE.procedureInterne || []).map(p => p.categoria))));
  const checklistTesto = editing ? (editing.checklistDocumenti || []).join('\n') : '';
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:760px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>${editing?'Modifica procedura':'Nuova procedura interna'}</h2><div class="modal-sub">Indicazioni operative per lo staff: passo per passo, in linguaggio semplice.</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <form id="formProcedura" onsubmit="return false;">
        <div class="grid2">
          <div class="field"><label>Categoria *</label><input id="procCategoria" list="procCategorieList" value="${editing?escapeHtml(editing.categoria):''}" placeholder="es. Apertura attività">
          <datalist id="procCategorieList">${categorieEsistenti.map(c=>`<option value="${escapeHtml(c)}">`).join('')}</datalist></div>
          <div class="field"><label>Nome procedura *</label><input id="procNome" value="${editing?escapeHtml(editing.nome):''}" placeholder="es. Apertura Partita IVA - Ditta individuale"></div>
        </div>
        <div class="field full" style="grid-column:1/-1;margin-top:10px;">
          <label>Contenuto (passo per passo) *</label>
          <textarea id="procContenuto" style="min-height:240px;font-size:13px;line-height:1.6;" placeholder="1. Primo passaggio...&#10;2. Secondo passaggio...">${editing?escapeHtml(editing.contenuto):''}</textarea>
        </div>
        <div class="field full" style="grid-column:1/-1;margin-top:10px;">
          <label>Documenti necessari (uno per riga)</label>
          <textarea id="procChecklist" style="min-height:90px;font-size:13px;" placeholder="Documento d'identità&#10;Visura camerale">${escapeHtml(checklistTesto)}</textarea>
        </div>
        <div style="margin-top:14px;">
          <label style="display:flex;align-items:center;gap:8px;font-weight:400;"><input type="checkbox" id="procAttivo" ${(!editing || editing.attivo)?'checked':''}> Attiva</label>
        </div>
      </form>
      <div class="modal-actions">
        <button class="btn" data-action="chiudi-modal">Annulla</button>
        <button class="btn primary" data-action="salva-procedura" data-id="${editing?editing.id:''}">${editing?'Salva modifiche':'Crea procedura'}</button>
      </div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
}

/* ============================================================================================
   INCASSI DELLO STUDIO (task #207): fatture/compensi che i clienti devono allo studio, scadenze di
   pagamento, incassi (anche parziali) e solleciti. I solleciti non partono mai da soli: Prisma
   prepara l'elenco di chi è scaduto da oltre 15 giorni dall'ultimo sollecito e li invia (come
   comunicazione visibile nel portale del cliente, con notifica) solo dopo conferma.
   ============================================================================================ */
const GIORNI_TRA_SOLLECITI_INCASSI = 15;
let INC_FILTRO = { cliente: 'Tutti', stato: 'Da incassare' };
function residuoIncasso(i) { return Math.max(0, (Number(i.importo) || 0) - (Number(i.importoIncassato) || 0)); }
function statoIncasso(i) {
  if (residuoIncasso(i) < 0.005) return 'Incassato';
  if (i.dataScadenza && i.dataScadenza < oggiISO()) return 'Scaduto';
  return 'Da incassare';
}
function aggiungiGiorniISO(iso, n) {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function aggiungiIncasso(d) {
  const i = Object.assign({
    id: uid('inc'), clienteId: null, descrizione: '', numero: '', importo: 0, dataEmissione: oggiISO(), dataScadenza: '',
    importoIncassato: 0, dataIncasso: null, note: '', solleciti: [], creatoIl: oggiISO(),
  }, d);
  i.importo = Number(i.importo) || 0;
  i.importoIncassato = Number(i.importoIncassato) || 0;
  if (!Array.isArray(i.solleciti)) i.solleciti = [];
  if (!STATE.incassi) STATE.incassi = [];
  STATE.incassi.push(i);
  salvaStato();
  return i;
}
function aggiornaIncasso(id, patch) {
  const i = (STATE.incassi || []).find(x => x.id === id);
  if (!i) return null;
  Object.assign(i, patch);
  if ('importo' in patch) i.importo = Number(i.importo) || 0;
  salvaStato();
  return i;
}
function eliminaIncasso(id) { STATE.incassi = (STATE.incassi || []).filter(x => x.id !== id); salvaStato(); }
function registraPagamentoIncasso(id, importo, data) {
  const i = (STATE.incassi || []).find(x => x.id === id);
  if (!i) throw new Error('Incasso non trovato: ' + id);
  const v = Number(importo);
  if (!(v > 0)) throw new Error('Importo non valido.');
  i.importoIncassato = Math.round(((Number(i.importoIncassato) || 0) + v) * 100) / 100;
  i.dataIncasso = data || oggiISO();
  salvaStato();
  return i;
}
function incassiDaSollecitare() {
  const oggi = oggiISO();
  return (STATE.incassi || []).filter(i => {
    if (statoIncasso(i) !== 'Scaduto') return false;
    const ultimo = (i.solleciti || []).map(x => x.data).sort().pop();
    return !ultimo || giorniTra(ultimo, oggi) >= GIORNI_TRA_SOLLECITI_INCASSI;
  });
}
function sollecitaIncasso(id) {
  const i = (STATE.incassi || []).find(x => x.id === id);
  if (!i || !i.clienteId) return false;
  const oggi = oggiISO();
  const ritardo = i.dataScadenza ? giorniTra(i.dataScadenza, oggi) : 0;
  const corpo = `Gentile cliente, risulta ancora da saldare ${i.numero ? 'il documento n. ' + i.numero : 'il compenso'}${i.descrizione ? ' (' + i.descrizione + ')' : ''} per ${fmtNum2(residuoIncasso(i))} euro${i.dataScadenza ? ', scaduto il ' + fmtData(i.dataScadenza) : ''}${ritardo > 0 ? ' (' + ritardo + ' giorni fa)' : ''}. Se ha già provveduto al pagamento, può ignorare questo messaggio; in caso contrario La preghiamo di regolarizzare appena possibile. Grazie, ${STATE.meta.studioNome || 'lo Studio'}.`;
  const com = { id: uid('com'), clienteId: i.clienteId, data: oggi, categoria: 'Amministrativa', stato: 'Inviata', oggetto: 'Promemoria di pagamento', corpo, note: '', visibilePortale: true, creataIl: new Date().toISOString() };
  STATE.comunicazioni.push(com);
  i.solleciti.push({ data: oggi, comunicazioneId: com.id });
  salvaStato();
  return true;
}
function renderIncassi() {
  if (STATE.clienti.length === 0) return `<div class="card"><div class="empty"><div class="big">Aggiungi prima un cliente</div>Gli incassi sono sempre legati a un cliente.</div></div>`;
  const tutti = STATE.incassi || [];
  const oggi = oggiISO();
  const daIncassare = tutti.filter(i => statoIncasso(i) !== 'Incassato');
  const totDa = daIncassare.reduce((s, i) => s + residuoIncasso(i), 0);
  const scaduti = tutti.filter(i => statoIncasso(i) === 'Scaduto');
  const totScaduto = scaduti.reduce((s, i) => s + residuoIncasso(i), 0);
  const mese = oggi.slice(0, 7);
  const incassatoMese = tutti.filter(i => i.dataIncasso && i.dataIncasso.slice(0, 7) === mese).reduce((s, i) => s + (Number(i.importoIncassato) || 0), 0);
  const daSoll = incassiDaSollecitare();
  const kpi = `<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
    <div class="kpi inscadenza"><div class="n">${fmtEuro(totDa)}</div><div class="l">DA INCASSARE</div></div>
    <div class="kpi scaduti"><div class="n">${fmtEuro(totScaduto)}</div><div class="l">DI CUI SCADUTO (${scaduti.length})</div></div>
    <div class="kpi completati"><div class="n">${fmtEuro(incassatoMese)}</div><div class="l">INCASSATO QUESTO MESE</div></div>
    <div class="kpi futuri"><div class="n">${daSoll.length}</div><div class="l">DA SOLLECITARE</div></div>
  </div>`;
  const banner = daSoll.length ? `<div class="card" style="background:var(--rosa-bg);display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
    <div><b>${daSoll.length} incass${daSoll.length === 1 ? 'o scaduto' : 'i scaduti'} da sollecitare</b><div class="helptext">Il promemoria arriva al cliente come comunicazione nel portale (con notifica). Non parte nulla senza la tua conferma.</div></div>
    <button class="btn primary" data-action="sollecita-tutti-incassi">Sollecita ${daSoll.length === 1 ? 'questo cliente' : 'tutti (' + daSoll.length + ')'}</button>
  </div>` : '';
  const toolbar = `<div class="toolbar">
    <div class="field"><label>Cliente</label><select data-action="inc-filtro-cliente">
      <option value="Tutti">Tutti</option>
      ${STATE.clienti.slice().sort((a, b) => a.ragioneSociale.localeCompare(b.ragioneSociale)).map(c => `<option value="${c.id}" ${INC_FILTRO.cliente === c.id ? 'selected' : ''}>${escapeHtml(c.ragioneSociale)}</option>`).join('')}
    </select></div>
    <div class="field"><label>Stato</label><select data-action="inc-filtro-stato">
      ${['Da incassare', 'Scaduti', 'Incassati', 'Tutti'].map(x => `<option ${INC_FILTRO.stato === x ? 'selected' : ''}>${x}</option>`).join('')}
    </select></div>
    <div class="field" style="margin-left:auto;"><label>&nbsp;</label><label class="btn" style="margin:0 8px 0 0;" title="Carica l'estratto conto (CSV/Excel): le entrate vengono abbinate agli incassi aperti per importo e origine">🏦 Riconcilia estratto conto<input type="file" accept=".csv,.xlsx,.xls,.pdf" style="display:none;" data-action="riconc-file"></label><button class="btn primary" data-action="nuovo-incasso">+ Nuovo incasso</button></div>
  </div>`;
  let lista = tutti.slice();
  if (INC_FILTRO.cliente !== 'Tutti') lista = lista.filter(i => i.clienteId === INC_FILTRO.cliente);
  if (INC_FILTRO.stato === 'Da incassare') lista = lista.filter(i => statoIncasso(i) !== 'Incassato');
  else if (INC_FILTRO.stato === 'Scaduti') lista = lista.filter(i => statoIncasso(i) === 'Scaduto');
  else if (INC_FILTRO.stato === 'Incassati') lista = lista.filter(i => statoIncasso(i) === 'Incassato');
  lista.sort((a, b) => (a.dataScadenza || '9999').localeCompare(b.dataScadenza || '9999'));
  if (tutti.length === 0) return kpi + toolbar + `<div class="card"><div class="empty"><div class="big">Nessun incasso registrato</div>Registra i compensi da incassare (anche da un preventivo accettato) e Prisma ti dirà chi è in ritardo.</div></div>`;
  if (lista.length === 0) return kpi + banner + toolbar + `<div class="card"><div class="empty">Nessun incasso corrisponde ai filtri.</div></div>`;
  const pag = paginaLista('incassi', lista);
  const righe = pag.pagina.map(i => {
    const st = statoIncasso(i);
    const badge = st === 'Incassato' ? '<span class="badge attivo">Incassato</span>' : (st === 'Scaduto' ? '<span class="badge stato-errore">Scaduto</span>' : '<span class="badge info">Da incassare</span>');
    const delta = i.dataScadenza && st !== 'Incassato' ? deltaLabel(i.dataScadenza).txt : '';
    const ult = (i.solleciti || []).map(x => x.data).sort().pop();
    return `<tr>
      <td>${escapeHtml(nomeCliente(i.clienteId))}</td>
      <td>${escapeHtml(i.descrizione || '')}${i.numero ? ` <span class="helptext">n. ${escapeHtml(i.numero)}</span>` : ''}</td>
      <td style="text-align:right;white-space:nowrap;">${fmtEuro(i.importo)}${(i.importoIncassato || 0) > 0 && st !== 'Incassato' ? `<div class="helptext">residuo ${fmtEuro(residuoIncasso(i))}</div>` : ''}</td>
      <td style="white-space:nowrap;">${i.dataScadenza ? fmtData(i.dataScadenza) : '—'}${delta ? `<div class="helptext">${escapeHtml(delta)}</div>` : ''}</td>
      <td>${badge}</td>
      <td class="helptext" style="white-space:nowrap;">${(i.solleciti || []).length ? (i.solleciti.length + ' · ult. ' + fmtDataBreve(ult)) : '—'}</td>
      <td style="white-space:nowrap;">
        ${st !== 'Incassato' ? `<button class="btn small primary" data-action="incasso-registra-apri" data-id="${i.id}">Incassa</button> <button class="btn small" data-action="sollecita-incasso" data-id="${i.id}" ${st !== 'Scaduto' ? 'disabled title="Si può sollecitare solo dopo la scadenza"' : ''}>Sollecita</button>` : ''}
        <button class="btn small" data-action="modifica-incasso" data-id="${i.id}">Modifica</button>
        <button class="btn small danger" data-action="elimina-incasso" data-id="${i.id}">Elimina</button>
      </td>
    </tr>`;
  }).join('');
  return kpi + banner + toolbar + `<div class="card" style="padding:0;overflow-x:auto;">
    <table class="compact"><thead><tr><th>Cliente</th><th>Descrizione</th><th style="text-align:right;">Importo</th><th>Scadenza</th><th>Stato</th><th>Solleciti</th><th></th></tr></thead>
    <tbody>${righe}</tbody></table></div>` + controlliPaginazione(pag);
}
function modalIncasso(id, preset) {
  const editing = id ? (STATE.incassi || []).find(x => x.id === id) : null;
  if (id && !editing) { toast('Incasso non trovato.'); return; }
  const v = editing || Object.assign({ clienteId: STATE.clienti[0] ? STATE.clienti[0].id : '', descrizione: '', numero: '', importo: '', dataEmissione: oggiISO(), dataScadenza: aggiungiGiorniISO(oggiISO(), 30), note: '' }, preset || {});
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:560px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>${editing ? 'Modifica incasso' : 'Nuovo incasso'}</h2><div class="modal-sub">Un compenso o una fattura che il cliente deve pagare allo studio.</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <form id="formIncasso" onsubmit="return false;"><div class="grid2">
        <div class="field full" style="grid-column:1/-1;"><label>Cliente *</label><select id="incCliente">${STATE.clienti.slice().sort((a, b) => a.ragioneSociale.localeCompare(b.ragioneSociale)).map(c => `<option value="${c.id}" ${v.clienteId === c.id ? 'selected' : ''}>${escapeHtml(c.ragioneSociale)}</option>`).join('')}</select></div>
        <div class="field full" style="grid-column:1/-1;"><label>Descrizione</label><input id="incDescrizione" value="${escapeHtml(v.descrizione || '')}" placeholder="es. Tenuta contabilità ottobre"></div>
        <div class="field"><label>N. fattura (facoltativo)</label><input id="incNumero" value="${escapeHtml(v.numero || '')}"></div>
        <div class="field"><label>Importo (€) *</label><input id="incImporto" type="number" step="0.01" min="0" value="${v.importo !== '' && v.importo != null ? v.importo : ''}"></div>
        <div class="field"><label>Data emissione</label><input id="incEmissione" type="date" value="${escapeHtml(v.dataEmissione || '')}"></div>
        <div class="field"><label>Scadenza pagamento</label><input id="incScadenza" type="date" value="${escapeHtml(v.dataScadenza || '')}"></div>
        <div class="field full" style="grid-column:1/-1;"><label>Note interne</label><input id="incNote" value="${escapeHtml(v.note || '')}"></div>
      </div></form>
      <div class="modal-actions"><button class="btn" data-action="chiudi-modal">Annulla</button><button class="btn primary" data-action="salva-incasso" data-id="${editing ? editing.id : ''}">${editing ? 'Salva' : 'Registra'}</button></div>
    </div></div>`;
}
function modalRegistraIncasso(id) {
  const i = (STATE.incassi || []).find(x => x.id === id);
  if (!i) return;
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:420px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>Registra incasso</h2><div class="modal-sub">${escapeHtml(nomeCliente(i.clienteId))} · residuo ${fmtEuro(residuoIncasso(i))}</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <div class="grid2" style="margin-top:10px;">
        <div class="field"><label>Importo incassato (€)</label><input id="incPagImporto" type="number" step="0.01" min="0" value="${residuoIncasso(i)}"></div>
        <div class="field"><label>Data</label><input id="incPagData" type="date" value="${oggiISO()}"></div>
      </div>
      <div class="helptext">Se è meno del residuo, resta da incassare la differenza (pagamento parziale).</div>
      <div class="modal-actions"><button class="btn" data-action="chiudi-modal">Annulla</button><button class="btn primary" data-action="incasso-registra" data-id="${i.id}">Conferma incasso</button></div>
    </div></div>`;
}

/* -------------------- ATTIVITÀ DA FATTURARE (pratiche extra) --------------------
   Chi svolge una pratica extra la registra qui (cliente, data, descrizione, importo se noto); la
   segreteria, quando prepara la fattura periodica del cliente (mensile/trimestrale/annuale…, vedi
   scheda cliente › Fatturazione), vede tutto ciò che è ancora aperto e lo include nella fattura,
   poi lo segna "Fatturata" con numero e data. Prisma non emette fatture: tiene il promemoria. */
const MESI_PERIODICITA_FATT = { 'Mensile': 1, 'Trimestrale': 3, 'Semestrale': 6, 'Annuale': 12 };
function aggiungiAttivitaFatturabile(d) {
  const a = Object.assign({ id: uid('fat'), clienteId: null, data: oggiISO(), descrizione: '', importo: null, stato: 'Da fatturare', fatturaNumero: '', fatturaData: null, operatore: operatoreCorrente() || null, creatoIl: oggiISO() }, d);
  a.importo = (a.importo === '' || a.importo == null) ? null : Number(a.importo);
  if (!STATE.attivitaFatturabili) STATE.attivitaFatturabili = [];
  STATE.attivitaFatturabili.push(a);
  salvaStato();
  return a;
}
function aggiornaAttivitaFatturabile(id, patch) {
  const a = (STATE.attivitaFatturabili || []).find(x => x.id === id);
  if (!a) return null;
  Object.assign(a, patch);
  if ('importo' in patch) a.importo = (a.importo === '' || a.importo == null) ? null : Number(a.importo);
  salvaStato();
  return a;
}
function eliminaAttivitaFatturabile(id) { STATE.attivitaFatturabili = (STATE.attivitaFatturabili || []).filter(x => x.id !== id); salvaStato(); }
function attivitaAperteCliente(clienteId) { return (STATE.attivitaFatturabili || []).filter(a => a.clienteId === clienteId && a.stato === 'Da fatturare'); }
function prossimaFatturazioneCliente(c) {
  const mesi = MESI_PERIODICITA_FATT[c.fatturazione];
  if (!mesi) return null;
  const base = c.ultimaFatturazione || c.dataIngresso;
  if (!base) return null;
  const [y, m, g] = base.split('-').map(Number);
  const tot = (m - 1) + mesi;
  const ny = y + Math.floor(tot / 12), nm = tot % 12;
  const ultimo = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(g, ultimo)).padStart(2, '0')}`;
}
/* Segna fatturate le attività indicate; se "periodica" aggiorna anche l'ultima fatturazione del cliente. */
function segnaAttivitaFatturate(ids, opz) {
  opz = opz || {};
  const data = opz.data || oggiISO();
  const sel = (STATE.attivitaFatturabili || []).filter(a => ids.includes(a.id) && a.stato === 'Da fatturare');
  sel.forEach(a => { a.stato = 'Fatturata'; a.fatturaNumero = opz.numero || ''; a.fatturaData = data; });
  const clienteId = opz.clienteId || (sel[0] && sel[0].clienteId);
  if (opz.periodica && clienteId) { const c = clienteById(clienteId); if (c) c.ultimaFatturazione = data; }
  let incasso = null;
  const tot = sel.reduce((t, a) => t + (Number(a.importo) || 0), 0);
  if (opz.creaIncasso && clienteId && (Number(opz.importoIncasso) || tot) > 0) {
    incasso = aggiungiIncasso({ clienteId, descrizione: opz.descrizioneIncasso || 'Fattura periodica con attività extra', numero: opz.numero || '', importo: Number(opz.importoIncasso) || tot, dataEmissione: data, dataScadenza: aggiungiGiorniISO(data, 30) });
  }
  salvaStato();
  return { segnate: sel.length, incasso };
}
let FATT_FILTRO = { cliente: 'Tutti', vista: 'aperte' };
function renderFatturazione() {
  const tutte = STATE.attivitaFatturabili || [];
  const aperte = tutte.filter(a => a.stato === 'Da fatturare');
  const oggi = oggiISO();
  const totAperto = aperte.reduce((t, a) => t + (Number(a.importo) || 0), 0);
  const attivi = STATE.clienti.filter(c => clienteAttivo(c));
  const dovute = attivi.filter(c => { const p = prossimaFatturazioneCliente(c); return p && p <= oggi; });
  const kpi = `<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
    <div class="kpi inscadenza"><div class="n">${aperte.length}</div><div class="l">ATTIVITÀ DA FATTURARE</div></div>
    <div class="kpi futuri"><div class="n">${fmtEuro(totAperto)}</div><div class="l">IMPORTO STIMATO APERTO</div></div>
    <div class="kpi scaduti"><div class="n">${dovute.length}</div><div class="l">FATTURE PERIODICHE DOVUTE</div></div>
    <div class="kpi completati"><div class="n">${tutte.length - aperte.length}</div><div class="l">GIÀ FATTURATE</div></div>
  </div>`;
  const toolbar = `<div class="toolbar">
    <div class="field"><label>Cliente</label><select data-action="fatt-filtro-cliente"><option value="Tutti">Tutti</option>${attivi.slice().sort((a, b) => a.ragioneSociale.localeCompare(b.ragioneSociale)).map(c => `<option value="${c.id}" ${FATT_FILTRO.cliente === c.id ? 'selected' : ''}>${escapeHtml(c.ragioneSociale)}</option>`).join('')}</select></div>
    <div class="field"><label>Vista</label><select data-action="fatt-filtro-vista"><option value="aperte" ${FATT_FILTRO.vista === 'aperte' ? 'selected' : ''}>Da fatturare</option><option value="storico" ${FATT_FILTRO.vista === 'storico' ? 'selected' : ''}>Già fatturate</option></select></div>
    <div class="field" style="margin-left:auto;"><label>&nbsp;</label><button class="btn primary" data-action="fatt-nuova">+ Nuova attività</button></div>
  </div>`;
  if (STATE.clienti.length === 0) return `<div class="card"><div class="empty"><div class="big">Aggiungi prima un cliente</div></div></div>`;
  if (FATT_FILTRO.vista === 'storico') {
    let st = tutte.filter(a => a.stato === 'Fatturata');
    if (FATT_FILTRO.cliente !== 'Tutti') st = st.filter(a => a.clienteId === FATT_FILTRO.cliente);
    st.sort((a, b) => (b.fatturaData || '').localeCompare(a.fatturaData || ''));
    if (!st.length) return kpi + toolbar + `<div class="card"><div class="empty">Nessuna attività fatturata.</div></div>`;
    return kpi + toolbar + `<div class="card"><table class="tbl"><thead><tr><th>Fattura</th><th>Cliente</th><th>Attività</th><th>Importo</th></tr></thead><tbody>${st.map(a => `<tr><td style="white-space:nowrap;">${escapeHtml(a.fatturaNumero || '—')} · ${fmtData(a.fatturaData)}</td><td>${escapeHtml(nomeCliente(a.clienteId))}</td><td>${escapeHtml(a.descrizione)}</td><td>${a.importo != null ? fmtEuro(a.importo) : '—'}</td></tr>`).join('')}</tbody></table></div>`;
  }
  let clienti = attivi.filter(c => attivitaAperteCliente(c.id).length > 0 || dovute.includes(c));
  if (FATT_FILTRO.cliente !== 'Tutti') clienti = clienti.filter(c => c.id === FATT_FILTRO.cliente);
  clienti.sort((a, b) => a.ragioneSociale.localeCompare(b.ragioneSociale));
  if (!clienti.length) return kpi + toolbar + `<div class="card"><div class="empty"><div class="big">Niente da fatturare</div>Registra le pratiche extra man mano che le svolgi: qui la segreteria le trova pronte per la fattura periodica.</div></div>`;
  const schede = clienti.map(c => {
    const ap = attivitaAperteCliente(c.id).sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    const pros = prossimaFatturazioneCliente(c);
    const dovuta = pros && pros <= oggi;
    const tot = ap.reduce((t, a) => t + (Number(a.importo) || 0), 0);
    const righe = ap.map(a => `<tr><td style="width:28px;"><input type="checkbox" class="fatt-sel" data-cliente="${c.id}" data-id="${a.id}" checked></td><td style="white-space:nowrap;">${fmtData(a.data)}</td><td>${escapeHtml(a.descrizione)}${a.operatore ? ` <span class="helptext">· ${escapeHtml(a.operatore)}</span>` : ''}</td><td style="white-space:nowrap;">${a.importo != null ? fmtEuro(a.importo) : '—'}</td><td style="white-space:nowrap;"><button class="btn small danger" data-action="fatt-elimina" data-id="${a.id}">Elimina</button></td></tr>`).join('');
    return `<div class="card" style="margin-bottom:12px;">
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
        <div style="font-weight:700;">${escapeHtml(c.ragioneSociale)}</div>
        <span class="badge info">Fatturazione: ${escapeHtml(c.fatturazione || 'non impostata')}</span>
        <span class="helptext">Ultima: ${c.ultimaFatturazione ? fmtData(c.ultimaFatturazione) : '—'} · Prossima: ${pros ? fmtData(pros) : (MESI_PERIODICITA_FATT[c.fatturazione] ? 'da definire' : '—')}</span>
        ${dovuta ? '<span class="badge stato-errore">Fattura periodica dovuta</span>' : ''}
        <div style="margin-left:auto;"><button class="btn small primary" data-action="fatt-segna-apri" data-cliente="${c.id}">Segna fatturate…</button></div>
      </div>
      ${ap.length ? `<table class="tbl" style="margin-top:8px;"><tbody>${righe}</tbody></table><div class="helptext" style="margin-top:4px;">Totale stimato extra: ${fmtEuro(tot)}</div>` : '<div class="helptext" style="margin-top:6px;">Nessuna attività extra aperta: solo fattura periodica.</div>'}
    </div>`;
  }).join('');
  return kpi + toolbar + schede;
}
function modalAttivitaFatturabile() {
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:520px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>Nuova attività da fatturare</h2><div class="modal-sub">Pratica extra prestata al cliente, da includere nella prossima fattura.</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <form id="formFatt" onsubmit="return false;"><div class="grid2">
        <div class="field full" style="grid-column:1/-1;"><label>Cliente *</label><select id="fattCliente">${STATE.clienti.filter(c => clienteAttivo(c)).sort((a, b) => a.ragioneSociale.localeCompare(b.ragioneSociale)).map(c => `<option value="${c.id}" ${FATT_FILTRO.cliente === c.id ? 'selected' : ''}>${escapeHtml(c.ragioneSociale)}</option>`).join('')}</select></div>
        <div class="field full" style="grid-column:1/-1;"><label>Descrizione *</label><input id="fattDescr" placeholder="es. Variazione dati camerali, pratica ravvedimento…"></div>
        <div class="field"><label>Data prestazione</label><input type="date" id="fattData" value="${oggiISO()}"></div>
        <div class="field"><label>Importo (€, se noto)</label><input type="number" step="0.01" min="0" id="fattImporto"></div>
      </div></form>
      <div class="modal-actions"><button class="btn" data-action="chiudi-modal">Annulla</button><button class="btn primary" data-action="fatt-salva">Salva</button></div>
    </div></div>`;
}
function modalSegnaFatturate(clienteId, ids) {
  const c = clienteById(clienteId);
  if (!c) return;
  const sel = (STATE.attivitaFatturabili || []).filter(a => ids.includes(a.id));
  const tot = sel.reduce((t, a) => t + (Number(a.importo) || 0), 0);
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:520px;" data-ids="${ids.join(',')}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>Segna fatturate</h2><div class="modal-sub">${escapeHtml(c.ragioneSociale)} · ${sel.length} attività${tot ? ' · ' + fmtEuro(tot) : ''}</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <form id="formSegnaFatt" onsubmit="return false;"><div class="grid2">
        <div class="field"><label>N. fattura</label><input id="sfNumero"></div>
        <div class="field"><label>Data fattura</label><input type="date" id="sfData" value="${oggiISO()}"></div>
        <div class="field full" style="grid-column:1/-1;"><label style="display:flex;gap:8px;align-items:center;"><input type="checkbox" id="sfPeriodica" checked> È la fattura periodica (${escapeHtml(c.fatturazione || 'periodicità non impostata')}): aggiorna "ultima fatturazione"</label></div>
        ${moduloAttivo('incassi') ? `<div class="field full" style="grid-column:1/-1;"><label style="display:flex;gap:8px;align-items:center;"><input type="checkbox" id="sfIncasso"> Crea l'incasso da riscuotere</label></div>
        <div class="field"><label>Importo fattura (€)</label><input type="number" step="0.01" min="0" id="sfImporto" value="${tot || ''}"></div>` : ''}
      </div></form>
      <div class="modal-actions"><button class="btn" data-action="chiudi-modal">Annulla</button><button class="btn primary" data-action="fatt-segna-conferma" data-cliente="${c.id}">Conferma</button></div>
    </div></div>`;
}

/* -------------------- LIBRI SOCIALI --------------------
   Quali libri ha ogni cliente, chi li detiene (studio / cliente / altro), ultima stampa e ultima pagina
   utilizzata, vidimazione. Solo promemoria organizzativo: la tenuta resta a norma di legge (art. 2421 ss. c.c.). */
const TIPI_LIBRO_SOCIALE = ['Libro soci', 'Libro verbali assemblee', 'Libro decisioni dei soci', 'Libro verbali CdA', 'Libro decisioni degli amministratori', 'Libro verbali collegio sindacale', 'Libro obbligazioni', 'Libro adunanze (altro)'];
const DETENTORI_LIBRO = ['Studio', 'Cliente', 'Altro'];
/* I libri di un cliente stanno sempre insieme (un solo "libro sociale" per cliente, senza tipo): al suo interno ci sono
   queste sezioni, ognuna con ciò che ci va stampato. */
const SEZIONI_LIBRO = ['Libro soci', 'Libro degli amministratori', 'Libro decisioni dei soci', 'Libro organo di controllo'];
const CONTENUTO_SEZIONI = {
  'Libro soci': 'Elenco dei soci, da stampare aggiornato quando cambia la compagine.',
  'Libro degli amministratori': 'Ogni verbale del CdA / decisione degli amministratori.',
  'Libro decisioni dei soci': "Atto costitutivo all'inizio, poi ogni verbale / decisione dei soci (compresa l'approvazione del bilancio).",
  'Libro organo di controllo': "Ogni verbale dell'organo di controllo, se nominato.",
};
function sezioneDaTipoVecchio(tipo) {
  const t = String(tipo || '').toLowerCase();
  if (/collegio|controllo|sindac/.test(t)) return 'Libro organo di controllo';
  if (/amministrator|cda/.test(t)) return 'Libro degli amministratori';
  if (/soci/.test(t) && !/decision|verbal|assemble/.test(t)) return 'Libro soci';
  return 'Libro decisioni dei soci';
}
/* Una sola scheda libro per cliente: unisce quelle esistenti (una per tipo) e riporta gli atti sulla sezione giusta. */
function unisciLibriSociali(stato) {
  const lista = Array.isArray(stato.libriSociali) ? stato.libriSociali : [];
  const perCliente = new Map();
  lista.forEach(l => { if (!perCliente.has(l.clienteId)) perCliente.set(l.clienteId, []); perCliente.get(l.clienteId).push(l); });
  const nuovi = []; const rimappa = {}; const tipoVecchio = {};
  perCliente.forEach(gruppo => {
    const base = gruppo[0];
    gruppo.forEach(l => { rimappa[l.id] = base.id; tipoVecchio[l.id] = l.tipo; });
    if (gruppo.length > 1) {
      const max = (k) => gruppo.map(l => l[k]).filter(v => v != null && v !== '').sort().pop();
      base.detenutoDa = gruppo.some(l => l.detenutoDa === 'Studio') ? 'Studio' : base.detenutoDa;
      base.detentoreNote = gruppo.map(l => l.detentoreNote).filter(Boolean)[0] || '';
      base.ultimaStampa = max('ultimaStampa') || null; base.ultimaPagina = max('ultimaPagina') != null ? Number(max('ultimaPagina')) : null; base.vidimazione = max('vidimazione') || null;
      base.note = Array.from(new Set(gruppo.map(l => l.note).filter(Boolean))).join(' · ');
    }
    base.tipo = 'Libri sociali';
    nuovi.push(base);
  });
  if (lista.some(l => l.tipo !== 'Libri sociali')) {
    (stato.documenti || []).forEach(d => {
      if (d.libroId && rimappa[d.libroId]) { if (!d.sezioneLibro) d.sezioneLibro = sezioneDaTipoVecchio(tipoVecchio[d.libroId]); d.libroId = rimappa[d.libroId]; }
    });
  }
  stato.libriSociali = nuovi;
}
function libroDelCliente(clienteId) { return (STATE.libriSociali || []).find(l => l.clienteId === clienteId) || null; }
/* ---- Stato fisico dei libri e cosa deve esserci stampato (ott. 2026) ----
   Per DEFAULT ogni società (di capitali / cooperativa) ha i suoi libri sociali. Per ognuna si tiene traccia di:
   - stato fisico: "da fare" (vanno stampati e vidimati in CCIAA), "fatti e vidimati ma ancora vuoti", "in uso";
   - cosa ci deve essere stampato: atto costitutivo, elenco soci, verbale di approvazione di ogni bilancio dalla
     costituzione (o almeno degli ultimi due esercizi se la data non è nota) + verbali dei task/pratiche chiuse;
   - fino a dove è già stampato (anche "pregresso", per i libri che esistono da anni). */
const STATI_FISICI_LIBRO = [
  { v: 'da_fare', l: 'Da fare: stampare e vidimare in CCIAA', corto: 'Da vidimare in CCIAA', cls: 'stato-da-fare' },
  { v: 'vidimati', l: 'Fatti e vidimati, ancora vuoti', corto: 'Vidimati, vuoti', cls: 'info' },
  { v: 'in_uso', l: 'In uso', corto: 'In uso', cls: 'stato-completato' },
];
function statoFisicoLibro(l) { return (l && l.statoFisico) || 'in_uso'; }
function infoStatoFisico(v) { return STATI_FISICI_LIBRO.find(x => x.v === v) || STATI_FISICI_LIBRO[2]; }
function societaConLibri(c) { return !!c && clienteAttivo(c) && libriPrevistiCliente(c).libri.length > 0; }
function assicuraLibriSocieta(stato) {
  if (!Array.isArray(stato.libriSociali)) stato.libriSociali = [];
  (stato.clienti || []).forEach(c => {
    if (!societaConLibri(c) || stato.libriSociali.some(l => l.clienteId === c.id)) return;
    stato.libriSociali.push({ id: uid('lib'), clienteId: c.id, tipo: 'Libri sociali', detenutoDa: 'Studio', detentoreNote: '', statoFisico: 'in_uso', ultimaStampa: null, ultimaPagina: null, vidimazione: null, note: '', creatoIl: oggiISO(), automatico: true });
  });
}
function ultimoEsercizioApprovato() {
  const oggi = oggiISO(); const anno = Number(oggi.slice(0, 4)); const mese = Number(oggi.slice(5, 7));
  return mese >= 7 ? anno - 1 : anno - 2; // bilancio approvato entro 120/180 giorni dalla chiusura
}
function etichettaStampato(v) { return v === 'pregresso' ? 'Già stampato (pregresso)' : 'Stampato il ' + fmtData(v); }
/* Voci che DEVONO esserci stampate nei libri di una società (stampate o no). */
function vociAttesaLibri(c) {
  const out = [];
  const fatte = STATE.stampeLibriFatte || {};
  const cost = Number(String(c.dataCostituzione || '').slice(0, 4)) || 0;
  const ult = ultimoEsercizioApprovato();
  const ingresso = Number(String(c.dataIngresso || '').slice(0, 4)) || 0;
  out.push({ key: `atto-${c.id}`, clienteId: c.id, esercizio: null, sezione: 'Libro decisioni dei soci', descrizione: 'Atto costitutivo e statuto', data: c.dataCostituzione || '', dataLabel: c.dataCostituzione ? fmtData(c.dataCostituzione) : 'Apertura', origine: 'Atteso: apertura del libro', stampatoIl: fatte[`atto-${c.id}`] || null });
  if (sociDiCliente(c.id).length) out.push({ key: `soci-${c.id}`, clienteId: c.id, esercizio: null, sezione: 'Libro soci', descrizione: 'Elenco dei soci aggiornato', data: '', dataLabel: 'Aggiornato', origine: 'Atteso: soci in anagrafica', stampatoIl: fatte[`soci-${c.id}`] || null });
  const primo = cost || (ult - 1);
  for (let es = primo; es <= ult; es++) {
    if (!cost && ingresso && ingresso > es + 1) continue;
    const key = `bilesp-${c.id}-${es}`;
    out.push({ key, clienteId: c.id, esercizio: es, sezione: 'Libro decisioni dei soci', descrizione: `Verbale di approvazione del bilancio ${es}`, data: `${es + 1}-05-30`, dataLabel: 'Esercizio ' + es, origine: 'Atteso: bilancio da approvare/approvato', stampatoIl: fatte[key] || null });
  }
  return out;
}
/* "Stampato fino a": sintesi dello stato di stampa dei libri di una società. */
function sintesiStampaLibri(c) {
  const voci = stampeLibriTutte().filter(x => x.clienteId === c.id && !x.key.startsWith('vid-'));
  if (!voci.length) return '—';
  const fatte = voci.filter(x => x.stampatoIl);
  if (!fatte.length) return 'Nulla di stampato';
  if (fatte.length === voci.length) return 'Tutto aggiornato';
  const ultima = fatte[fatte.length - 1];
  return 'Fino a: ' + (ultima.key.startsWith('atto-') ? 'atto costitutivo' : ultima.key.startsWith('soci-') ? 'elenco soci' : ultima.descrizione.replace('Verbale di approvazione del ', '').replace('Verbale: ', ''));
}
/* scelta: 'nulla' | 'atto' | 'es-AAAA' | 'tutto'  -> segna come già stampato ("pregresso") tutto fino a quel punto. */
function impostaStampatoFino(clienteId, scelta) {
  const c = clienteById(clienteId); if (!c) return;
  if (!STATE.stampeLibriFatte) STATE.stampeLibriFatte = {};
  vociAttesaLibri(c).forEach(v => {
    let fatto = false;
    if (scelta === 'tutto') fatto = true;
    else if (scelta === 'atto') fatto = v.key.startsWith('atto-');
    else if (/^es-\d{4}$/.test(scelta)) fatto = v.esercizio == null || v.esercizio <= Number(scelta.slice(3));
    if (fatto) { if (!STATE.stampeLibriFatte[v.key]) STATE.stampeLibriFatte[v.key] = 'pregresso'; }
    else delete STATE.stampeLibriFatte[v.key];
  });
  const l = libroDelCliente(clienteId);
  if (l && scelta !== 'nulla' && statoFisicoLibro(l) === 'da_fare') l.statoFisico = 'in_uso';
  salvaStato();
}
/* Verbali/atti da stampare nei libri, in ordine cronologico. Automatici: bilancio approvato (pratica "Bilancio/Verbale assemblea"
   completata) e task con la spunta "stampa verbale" chiusi; entrambi solo se i libri sono gestiti dallo studio. */
function stampeLibriTutte() {
  const out = [];
  const fatte = STATE.stampeLibriFatte || {};
  const gestiti = (cid) => { const l = libroDelCliente(cid); return !!l && l.detenutoDa === 'Studio'; };
  const cl = (cid) => { const c = clienteById(cid); return !!c && clienteAttivo(c); };
  try {
    derivati().annuali.forEach(a => {
      if (a.tipoChiave !== 'BILANCIO' || !a.completato || !gestiti(a.clienteId) || !cl(a.clienteId)) return;
      const date = (a.sotto || []).map(x => x.data).filter(Boolean).sort();
      const key = `bil-${a.clienteId}-${a.anno}`;
      out.push({ key, clienteId: a.clienteId, annoApprovazione: a.anno, sezione: 'Libro decisioni dei soci', descrizione: `Verbale di approvazione del bilancio ${a.anno - 1}`, data: date.length ? date[date.length - 1] : oggiISO(), origine: 'Pratica bilancio completata', stampatoIl: fatte[key] || null });
    });
  } catch (e) { /* derivati non disponibile in contesti parziali */ }
  (STATE.taskTeam || []).forEach(t => {
    if (!t.stampaVerbale || t.stato !== 'Fatto' || !t.clienteId || !gestiti(t.clienteId) || !cl(t.clienteId)) return;
    const key = `task-${t.id}`;
    out.push({ key, clienteId: t.clienteId, sezione: t.stampaSezione || 'Libro decisioni dei soci', descrizione: `Verbale: ${t.titolo}`, data: t.fattoIl || t.scadenza || t.creatoIl || oggiISO(), origine: 'Task completato', stampatoIl: fatte[key] || null });
  });
  (STATE.stampeLibri || []).forEach(m => out.push({ key: `man-${m.id}`, manualeId: m.id, clienteId: m.clienteId, sezione: m.sezione, descrizione: m.descrizione, data: m.data || m.creatoIl, origine: 'Inserito a mano', stampatoIl: m.stampatoIl || null }));
  // Voci attese per ogni società con libri tenuti dallo studio (default: tutte le società)
  const approvazioniAuto = new Set(out.filter(x => x.key.startsWith('bil-')).map(x => x.clienteId + '|' + x.annoApprovazione));
  (STATE.clienti || []).forEach(c => {
    if (!societaConLibri(c)) return;
    const l = libroDelCliente(c.id);
    if (!l || l.detenutoDa !== 'Studio') return;
    if (statoFisicoLibro(l) === 'da_fare') {
      out.push({ key: `vid-${c.id}`, clienteId: c.id, sezione: 'Tutti i libri', descrizione: 'Stampare e vidimare i libri sociali in Camera di Commercio', data: '', dataLabel: 'Prima di tutto', origine: 'Libri non ancora fatti', stampatoIl: null });
      return;
    }
    vociAttesaLibri(c).forEach(v => { if (v.esercizio != null && approvazioniAuto.has(c.id + '|' + (v.esercizio + 1))) return; out.push(v); });
  });
  return out.sort((a, b) => String(a.data).localeCompare(String(b.data)));
}
function stampeLibriDaFare() { return stampeLibriTutte().filter(x => !x.stampatoIl); }
function segnaStampaLibro(key, fatta) {
  const data = fatta ? oggiISO() : null;
  if (key.startsWith('vid-')) { // libri vidimati in CCIAA: da "da fare" a "fatti e vidimati, vuoti"
    const l = libroDelCliente(key.slice(4));
    if (l && fatta) { l.statoFisico = 'vidimati'; l.vidimazione = oggiISO(); salvaStato(); }
    return;
  }
  if (key.startsWith('man-')) { const m = (STATE.stampeLibri || []).find(x => x.id === key.slice(4)); if (m) m.stampatoIl = data; }
  else { if (!STATE.stampeLibriFatte) STATE.stampeLibriFatte = {}; if (data) STATE.stampeLibriFatte[key] = data; else delete STATE.stampeLibriFatte[key]; }
  salvaStato();
}
function htmlStampeLibri(clienteId) {
  const tutte = stampeLibriTutte().filter(x => !clienteId || x.clienteId === clienteId);
  const da = tutte.filter(x => !x.stampatoIl);
  const fatteRecenti = tutte.filter(x => x.stampatoIl).sort((a, b) => b.stampatoIl.localeCompare(a.stampatoIl)).slice(0, 5);
  const riga = (x) => `<tr><td style="white-space:nowrap;">${x.dataLabel ? escapeHtml(x.dataLabel) : fmtData(x.data)}</td>${clienteId ? '' : `<td>${escapeHtml(nomeCliente(x.clienteId))}</td>`}<td>${escapeHtml(x.sezione)}</td><td>${escapeHtml(x.descrizione)} <span class="helptext">· ${escapeHtml(x.origine)}</span></td>
    <td style="white-space:nowrap;"><label class="checkline"><input type="checkbox" data-action="stampa-libro-segna" data-key="${escapeHtml(x.key)}" ${x.stampatoIl ? 'checked' : ''}> ${x.stampatoIl ? etichettaStampato(x.stampatoIl) : (x.key.startsWith('vid-') ? 'Fatto in CCIAA' : 'Da stampare')}</label>${x.manualeId ? ` <button class="btn small danger" data-action="stampa-libro-elimina" data-id="${x.manualeId}">✕</button>` : ''}</td></tr>`;
  const testa = `<thead><tr><th>Data</th>${clienteId ? '' : '<th>Cliente</th>'}<th>Sezione del libro</th><th>Cosa stampare</th><th></th></tr></thead>`;
  return `<div class="card" ${da.length ? 'style="border-left:4px solid var(--arancio,#d97706);"' : ''}><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;"><div class="section-title" style="margin:0;">Verbali da stampare nei libri <span class="cnt">${da.length}</span></div><button class="btn" data-action="stampa-libro-nuova" data-cliente="${clienteId || ''}">+ Da stampare</button></div>
    <div class="helptext" style="margin:4px 0 8px;">In ordine cronologico. Per ogni società (libri tenuti dallo studio): atto costitutivo, elenco soci e verbale di approvazione di ogni bilancio dalla costituzione, più i verbali dei task chiusi con la spunta "stampa verbale". Se i libri non sono ancora stati fatti, prima c'è la vidimazione in CCIAA.</div>
    ${da.length ? `<table class="compact">${testa}<tbody>${da.map(riga).join('')}</tbody></table>` : '<div class="helptext">Niente da stampare.</div>'}
    ${fatteRecenti.length ? `<details style="margin-top:8px;"><summary class="helptext" style="cursor:pointer;">Ultime stampate</summary><table class="compact" style="margin-top:6px;">${testa}<tbody>${fatteRecenti.map(riga).join('')}</tbody></table></details>` : ''}</div>`;
}
function modalStampaLibro(clienteId) {
  const clienti = STATE.clienti.filter(c => clienteAttivo(c)).sort((a, b) => a.ragioneSociale.localeCompare(b.ragioneSociale));
  h('modalRoot').innerHTML = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop"><div class="modal" style="max-width:520px;">
    <div style="display:flex;justify-content:space-between;"><h2>Da stampare nei libri</h2><button class="icon-x" data-action="chiudi-modal">✕</button></div>
    <div class="grid2">
      <div class="field full" style="grid-column:1/-1;"><label>Cliente *</label><select id="slCliente">${clienti.map(c => `<option value="${c.id}" ${c.id === clienteId ? 'selected' : ''}>${escapeHtml(c.ragioneSociale)}</option>`).join('')}</select></div>
      <div class="field"><label>Sezione del libro</label><select id="slSezione">${SEZIONI_LIBRO.map(x => `<option ${x === 'Libro decisioni dei soci' ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div class="field"><label>Data dell'atto</label><input type="date" id="slData" value="${oggiISO()}"></div>
      <div class="field full" style="grid-column:1/-1;"><label>Cosa stampare *</label><input id="slDescr" placeholder="es. Verbale assemblea di nomina amministratore"></div>
    </div>
    <div class="modal-actions"><button class="btn" data-action="chiudi-modal">Annulla</button><button class="btn primary" data-action="stampa-libro-salva">Aggiungi</button></div></div></div>`;
}
function aggiungiLibroSociale(d) {
  const l = Object.assign({ id: uid('lib'), clienteId: null, tipo: 'Libri sociali', detenutoDa: 'Studio', detentoreNote: '', ultimaStampa: null, ultimaPagina: null, vidimazione: null, note: '', creatoIl: oggiISO() }, d);
  l.ultimaPagina = (l.ultimaPagina === '' || l.ultimaPagina == null) ? null : Number(l.ultimaPagina);
  if (!STATE.libriSociali) STATE.libriSociali = [];
  STATE.libriSociali.push(l);
  salvaStato();
  return l;
}
function aggiornaLibroSociale(id, patch) {
  const l = (STATE.libriSociali || []).find(x => x.id === id);
  if (!l) return null;
  Object.assign(l, patch);
  if ('ultimaPagina' in patch) l.ultimaPagina = (l.ultimaPagina === '' || l.ultimaPagina == null) ? null : Number(l.ultimaPagina);
  salvaStato();
  return l;
}
function eliminaLibroSociale(id) { STATE.libriSociali = (STATE.libriSociali || []).filter(x => x.id !== id); salvaStato(); }
/* ---- Atti da riportare nei libri sociali (ott. 2026) ----
   Ogni documento del cliente può essere "assegnato" a un suo libro con una data dell'atto: così il tab
   Libri sociali mostra, in ordine di data, tutto ciò che va trascritto e a che punto è.
   Campi aggiunti ai documenti (STATE.documenti): libroId, dataAtto, tipoAtto, pagine, trascritto, trascrittoIl.
   Regole di base (promemoria organizzativo, non parere legale; verificare sempre le fonti):
   - SRL (art. 2478 c.c.): libro decisioni dei soci, libro decisioni degli amministratori, libro decisioni
     dell'organo di controllo se nominato. Il libro soci è stato abolito nel 2009 (resta facoltativo).
   - SPA (art. 2421 c.c.): libro soci, obbligazioni, adunanze di assemblee, CdA, collegio sindacale, comitato
     esecutivo, assemblee degli obbligazionisti, strumenti finanziari.
   - Cooperative: libro soci, assemblee, CdA, organo di controllo.
   - Ditte individuali e società di persone: nessun libro sociale obbligatorio (solo libri contabili).
   - Atto costitutivo e statuto: per scelta di prassi dello studio si riportano come PRIMO atto del libro
     (la norma non lo impone, ma è consuetudine aprire il libro con questi documenti). Nell'elenco restano
     sempre in cima, prima degli atti ordinati per data. I verbali redatti dal notaio vanno riportati nel libro
     delle assemblee/decisioni; il bilancio si allega al verbale di approvazione. */
const CAT_ATTO_COSTITUTIVO = 'Atto costitutivo/Statuto';
const TIPI_ATTO_LIBRO = ['Approvazione bilancio', 'Nomina / rinnovo cariche', 'Modifica statuto', 'Distribuzione utili / riserve', 'Aumento / riduzione capitale', 'Cessione o trasferimento quote', 'Decisione degli amministratori', 'Relazione / verbale organo di controllo', 'Altro'];
function libriPrevistiCliente(c) {
  const t = c && c.tipo;
  if (t === 'societa_capitali') return { titolo: 'Società di capitali', libri: ['Libro decisioni dei soci', 'Libro decisioni degli amministratori', 'Libro verbali collegio sindacale'], note: 'Se è una SRL: decisioni dei soci, decisioni degli amministratori e, se è nominato un organo di controllo, il suo libro (art. 2478 c.c.). Il libro soci delle SRL non è più obbligatorio dal 2009. Se è una SPA servono anche libro soci, obbligazioni, comitato esecutivo, ecc. (art. 2421 c.c.). Per i libri sociali delle società di capitali è dovuta ogni anno la tassa di vidimazione (F24, codice 7085, entro il 16 marzo).' };
  if (t === 'cooperativa') return { titolo: 'Cooperativa', libri: ['Libro soci', 'Libro verbali assemblee', 'Libro verbali CdA', 'Libro verbali collegio sindacale'], note: 'Libro soci, libro delle assemblee, del CdA e dell\'organo di controllo (se presente).' };
  if (t === 'societa_persone' || t === 'ditta_individuale' || t === 'persona_fisica') return { titolo: 'Impresa individuale / società di persone', libri: [], note: 'Nessun libro sociale obbligatorio: restano solo i libri contabili. Eventuali patti o decisioni dei soci si conservano come documenti, senza libro.' };
  return { titolo: 'Altra forma', libri: [], note: 'Verifica quali libri impone lo statuto o la forma giuridica.' };
}
function attiLibroCliente(clienteId) {
  return (STATE.documenti || []).filter(d => d.clienteId === clienteId && d.libroId).sort(ordinaAtti);
}
/* atto costitutivo/statuto sempre per primi, poi per data dell'atto */
function ordinaAtti(a, b) {
  const pa = a.categoria === CAT_ATTO_COSTITUTIVO ? 0 : 1, pb = b.categoria === CAT_ATTO_COSTITUTIVO ? 0 : 1;
  return pa - pb || String(a.dataAtto || '').localeCompare(String(b.dataAtto || ''));
}
function documentiBaseSocieta(clienteId) {
  return (STATE.documenti || []).filter(d => d.clienteId === clienteId && (d.categoria === CAT_ATTO_COSTITUTIVO || d.categoria === 'Visura camerale'));
}
/* atto costitutivo/statuto caricati ma non ancora assegnati a un libro */
function baseDaAssegnare(clienteId) {
  return (STATE.documenti || []).filter(d => d.clienteId === clienteId && d.categoria === CAT_ATTO_COSTITUTIVO && !d.libroId);
}
function attiDaTrascrivere() {
  return (STATE.documenti || []).filter(d => d.libroId && !d.trascritto).sort(ordinaAtti);
}
function assegnaAttoLibro(docId, dati) {
  const d = (STATE.documenti || []).find(x => x.id === docId);
  if (!d) return null;
  Object.assign(d, { libroId: dati.libroId, sezioneLibro: dati.sezioneLibro || d.sezioneLibro || 'Libro decisioni dei soci', dataAtto: dati.dataAtto, tipoAtto: dati.tipoAtto || 'Altro', pagine: dati.pagine || '', trascritto: !!dati.trascritto, trascrittoIl: dati.trascritto ? (d.trascrittoIl || oggiISO()) : null });
  salvaStato();
  return d;
}
function scollegaAttoLibro(docId) {
  const d = (STATE.documenti || []).find(x => x.id === docId);
  if (!d) return;
  ['libroId', 'sezioneLibro', 'dataAtto', 'tipoAtto', 'pagine', 'trascritto', 'trascrittoIl'].forEach(k => { delete d[k]; });
  salvaStato();
}
function lacuneLibriCliente(c) {
  const out = [];
  if (!c || !clienteAttivo(c) || !(c.tipo === 'societa_capitali' || c.tipo === 'cooperativa')) return out;
  const oggi = oggiISO(); const anno = Number(oggi.slice(0, 4)); const mese = Number(oggi.slice(5, 7));
  const ultimoDovuto = mese >= 7 ? anno - 1 : anno - 2; // bilancio approvato entro 120/180 giorni dalla chiusura
  const ingresso = Number(String(c.dataIngresso || '').slice(0, 4)) || 0;
  const atti = attiLibroCliente(c.id);
  [ultimoDovuto - 1, ultimoDovuto].forEach(es => {
    if (ingresso && ingresso > es + 1) return;
    const presente = atti.some(d => d.tipoAtto === 'Approvazione bilancio' && Number(String(d.dataAtto || '').slice(0, 4)) === es + 1);
    if (!presente) out.push(`Esercizio ${es}: non risulta il verbale o la decisione di approvazione del bilancio (atteso nel ${es + 1}).`);
  });
  return out;
}
function modalAttoLibro(docId) {
  const cid = LIBRI_FILTRO.cliente;
  const ed = docId ? (STATE.documenti || []).find(x => x.id === docId) : null;
  const clienteId = ed ? ed.clienteId : cid;
  if (!clienteId || clienteId === 'Tutti') { toast('Scegli prima il cliente nel filtro in alto.'); return; }
  const libri = (STATE.libriSociali || []).filter(l => l.clienteId === clienteId);
  if (!libri.length) { toast('Registra prima almeno un libro per questo cliente (+ Aggiungi libro).'); return; }
  const liberi = (STATE.documenti || []).filter(d => d.clienteId === clienteId && !d.libroId);
  const v = ed || { libroId: libri[0].id, sezioneLibro: 'Libro decisioni dei soci', dataAtto: '', tipoAtto: TIPI_ATTO_LIBRO[0], pagine: '', trascritto: false };
  const selDoc = ed ? '' : `<div class="field full" style="grid-column:1/-1;"><label>Documento</label><select id="atDoc"><option value="">— nuovo file da caricare —</option>${liberi.map(d => `<option value="${d.id}">${escapeHtml(d.nome)}${d.categoria ? ' (' + escapeHtml(d.categoria) + ')' : ''}</option>`).join('')}</select></div>
        ${HTTP_SYNC_ATTIVO ? `<div class="field full" style="grid-column:1/-1;"><label>Nuovo file (se non scegli un documento già caricato)</label><input type="file" id="atFile"></div>` : ''}
        <div class="field full" style="grid-column:1/-1;"><label>Nome del documento (per un nuovo file)</label><input id="atNome" placeholder="es. Verbale assemblea approvazione bilancio 2025"></div>`;
  h('modalRoot').innerHTML = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop"><div class="modal" style="max-width:560px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;"><div><h2>${ed ? 'Modifica atto' : 'Atto da riportare nel libro'}</h2><div class="modal-sub">${escapeHtml(nomeCliente(clienteId))}</div></div><button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button></div>
    <form id="formAtto" onsubmit="return false;"><div class="grid2">
      ${selDoc}
      <div class="field"><label>Sezione del libro *</label><select id="atLibro">${SEZIONI_LIBRO.map(x => `<option ${v.sezioneLibro === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div class="field"><label>Data dell'atto *</label><input type="date" id="atData" value="${escapeHtml(v.dataAtto || '')}"></div>
      <div class="field"><label>Tipo di atto</label><select id="atTipo">${TIPI_ATTO_LIBRO.map(t => `<option ${v.tipoAtto === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label>Pagine nel libro</label><input id="atPagine" value="${escapeHtml(v.pagine || '')}" placeholder="es. 12-14"></div>
      <label class="checkline" style="grid-column:1/-1;display:block;"><input type="checkbox" id="atTrascr" ${v.trascritto ? 'checked' : ''}> Già trascritto nel libro</label>
    </div></form>
    <div class="modal-actions"><button class="btn" data-action="chiudi-modal">Annulla</button><button class="btn primary" data-action="atto-salva" data-id="${ed ? ed.id : ''}" data-cliente="${clienteId}">Salva</button></div>
  </div></div>`;
}
function dettaglioLibriCliente(c) {
  const prev = libriPrevistiCliente(c);
  const mieiLibri = (STATE.libriSociali || []).filter(l => l.clienteId === c.id);
  const lacune = lacuneLibriCliente(c);
  const atti = attiLibroCliente(c.id);
  const base = documentiBaseSocieta(c.id);
  const libriPrev = prev.libri.length ? `<div style="margin:8px 0;">${SEZIONI_LIBRO.filter(x => x !== 'Libro organo di controllo' || prev.libri.some(n => /collegio|controllo/i.test(n))).map(x => `<div style="padding:6px 0;border-bottom:1px solid var(--border);"><b>${escapeHtml(x)}</b> <span class="helptext">— ${escapeHtml(CONTENUTO_SEZIONI[x])}${x === 'Libro soci' ? ' Soci in anagrafica: ' + sociDiCliente(c.id).length + '.' : ''}</span></div>`).join('')}</div>` : '';
  const daAss = baseDaAssegnare(c.id);
  const haCostitutivo = (STATE.documenti || []).some(d => d.clienteId === c.id && d.categoria === CAT_ATTO_COSTITUTIVO);
  const righeApertura = (daAss.length ? daAss.map(d => `<tr style="background:var(--giallo-bg,#fff8e1);"><td>—</td><td colspan="2">Apertura del libro: atto costitutivo / statuto</td>
      <td>${escapeHtml(d.nome)} ${d.filePercorso ? `<a href="${linkScaricaFileReale(d.filePercorso)}" target="_blank">📎</a>` : ''}</td><td>—</td><td>Da assegnare a un libro</td>
      <td><button class="btn small" data-action="atto-modifica" data-id="${d.id}">Assegna al libro</button></td></tr>`).join('') : '')
    + (!haCostitutivo && (prev.libri.length) ? `<tr style="background:var(--giallo-bg,#fff8e1);"><td>—</td><td colspan="6" class="helptext">Primo atto del libro: atto costitutivo e statuto, non ancora caricati. Caricali da Documenti con categoria "Atto costitutivo/Statuto".</td></tr>` : '');
  const baseAltri = base.filter(d => d.categoria !== CAT_ATTO_COSTITUTIVO);
  const righeBase = baseAltri.length ? baseAltri.map(d =>`<tr><td>${escapeHtml(d.nome)}</td><td>${escapeHtml(d.categoria)}</td><td>${d.dataCaricamento ? fmtData(d.dataCaricamento) : '—'}</td><td>${d.filePercorso ? `<a href="${linkScaricaFileReale(d.filePercorso)}" target="_blank">📎 apri</a>` : ''}</td></tr>`).join('') : '<tr><td colspan="4" class="helptext">Nessun documento di base caricato. Caricalo da Documenti con categoria "Atto costitutivo/Statuto" o "Visura camerale".</td></tr>';
  const righeAtti = atti.length ? atti.map(d => { const l = (STATE.libriSociali || []).find(x => x.id === d.libroId); return `<tr>
      <td style="white-space:nowrap;">${d.dataAtto ? fmtData(d.dataAtto) : '—'}</td><td>${escapeHtml(d.sezioneLibro || '—')}</td><td>${escapeHtml(d.tipoAtto || '')}</td>
      <td>${escapeHtml(d.nome)} ${d.filePercorso ? `<a href="${linkScaricaFileReale(d.filePercorso)}" target="_blank">📎</a>` : ''}</td><td>${escapeHtml(d.pagine || '—')}</td>
      <td><label class="checkline"><input type="checkbox" data-action="atto-trascritto" data-id="${d.id}" ${d.trascritto ? 'checked' : ''}> ${d.trascritto ? 'Trascritto' + (d.trascrittoIl ? ' il ' + fmtData(d.trascrittoIl) : '') : 'Da trascrivere'}</label></td>
      <td style="white-space:nowrap;"><button class="btn small" data-action="atto-modifica" data-id="${d.id}">Modifica</button> <button class="btn small danger" data-action="atto-scollega" data-id="${d.id}" title="Toglie l'atto dal libro, il documento resta in Documenti">Scollega</button></td>
    </tr>`; }).join('') : `<tr><td colspan="7" class="helptext">Nessun atto collegato ai libri. Usa "+ Atto da riportare" per caricare un verbale o assegnare un documento già presente.</td></tr>`;
  const lib = libroDelCliente(c.id);
  const attese = societaConLibri(c) && lib ? stampeLibriTutte().filter(x => x.clienteId === c.id && !x.key.startsWith('vid-')) : [];
  const esMax = ultimoEsercizioApprovato();
  const esAtt = attese.map(x => x.esercizio).filter(x => x != null);
  const opzFino = [['nulla', 'Nulla di stampato'], ['atto', "Solo l'atto costitutivo"]].concat(Array.from(new Set(esAtt)).sort().map(e => ['es-' + e, `Fino al bilancio ${e}`])).concat([['tutto', 'Tutto aggiornato']]);
  const punto = lib ? `<div class="card"><div class="section-title">A che punto sono i libri di ${escapeHtml(c.ragioneSociale)}</div>
    <div class="grid2" style="margin-top:6px;">
      <div class="field"><label>Stato dei libri</label><select data-action="libro-stato-fisico" data-id="${lib.id}">${STATI_FISICI_LIBRO.map(t => `<option value="${t.v}" ${statoFisicoLibro(lib) === t.v ? 'selected' : ''}>${escapeHtml(t.l)}</option>`).join('')}</select></div>
      ${attese.length && statoFisicoLibro(lib) !== 'da_fare' ? `<div class="field"><label>Già stampato fino a… (segna in blocco come "pregresso")</label><select data-action="libri-stampato-fino" data-cliente="${c.id}"><option value="">— scegli —</option>${opzFino.map(o => `<option value="${o[0]}">${escapeHtml(o[1])}</option>`).join('')}</select></div>` : ''}
    </div>
    ${c.dataCostituzione ? '' : `<div class="helptext" style="margin-top:6px;">Data di costituzione non indicata in anagrafica: considero solo gli ultimi due esercizi (${esMax - 1} e ${esMax}). Inseriscila per avere l'elenco completo dall'atto costitutivo.</div>`}
    ${statoFisicoLibro(lib) === 'da_fare' ? `<div class="helptext" style="margin-top:6px;">I libri non sono ancora stati fatti: serve prima la vidimazione in CCIAA (compare tra i "verbali da stampare"). Poi imposta "Fatti e vidimati".</div>` : ''}
    ${attese.length ? `<table class="compact" style="margin-top:8px;"><thead><tr><th>Quando</th><th>Libro</th><th>Cosa</th><th>Stato</th></tr></thead><tbody>${attese.map(x => `<tr><td style="white-space:nowrap;">${x.dataLabel ? escapeHtml(x.dataLabel) : fmtData(x.data)}</td><td>${escapeHtml(x.sezione)}</td><td>${escapeHtml(x.descrizione)}</td><td><label class="checkline"><input type="checkbox" data-action="stampa-libro-segna" data-key="${escapeHtml(x.key)}" ${x.stampatoIl ? 'checked' : ''}> ${x.stampatoIl ? etichettaStampato(x.stampatoIl) : 'Da stampare'}</label></td></tr>`).join('')}</tbody></table>` : ''}
  </div>` : '';
  return punto + `<div class="card"><div class="section-title">Cosa va nei libri di ${escapeHtml(c.ragioneSociale)} — ${escapeHtml(prev.titolo)}</div>${libriPrev}<div class="helptext">${escapeHtml(prev.note)} <em>Promemoria organizzativo: verifica sempre statuto e norme.</em></div></div>
  ${lacune.length ? `<div class="card" style="border-left:4px solid var(--arancio,#d97706);"><div class="section-title">Cosa potrebbe mancare</div><ul style="margin:6px 0 0 18px;line-height:1.6;">${lacune.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>` : ''}
  <div class="card"><div class="section-title">Altri documenti della società <span class="helptext" style="font-weight:400;">· visura e simili, si conservano nel fascicolo (atto costitutivo e statuto sono il primo atto dell'elenco sotto)</span></div>
    <table class="compact"><thead><tr><th>Documento</th><th>Categoria</th><th>Caricato il</th><th></th></tr></thead><tbody>${righeBase}</tbody></table></div>
  <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;"><div class="section-title" style="margin:0;">Atti da riportare nei libri, in ordine di data</div><button class="btn primary" data-action="atto-nuovo">+ Atto da riportare</button></div>
    <table class="compact" style="margin-top:8px;"><thead><tr><th>Data atto</th><th>Libro</th><th>Tipo</th><th>Documento</th><th>Pagine</th><th>Stato</th><th></th></tr></thead><tbody>${righeApertura}${righeAtti}</tbody></table></div>`;
}
function sezioneAttiGlobale() {
  const da = attiDaTrascrivere();
  if (!da.length) return '';
  return `<div class="card"><div class="section-title">Atti ancora da trascrivere <span class="cnt">${da.length}</span></div><table class="compact"><thead><tr><th>Data atto</th><th>Cliente</th><th>Libro</th><th>Tipo</th><th>Documento</th></tr></thead><tbody>${da.slice(0, 50).map(d => { const l = (STATE.libriSociali || []).find(x => x.id === d.libroId); return `<tr><td style="white-space:nowrap;">${d.dataAtto ? fmtData(d.dataAtto) : '—'}</td><td>${escapeHtml(nomeCliente(d.clienteId))}</td><td>${escapeHtml(d.sezioneLibro || '—')}</td><td>${escapeHtml(d.tipoAtto || '')}</td><td>${escapeHtml(d.nome)}</td></tr>`; }).join('')}</tbody></table></div>`;
}
let LIBRI_FILTRO = { cliente: 'Tutti', tipo: 'Tutti', detentore: 'Tutti', stato: 'Tutti' };
function renderLibriSociali() {
  assicuraLibriSocieta(STATE);
  const tutti = STATE.libriSociali || [];
  const daStampare = stampeLibriDaFare();
  const conta = (cond) => tutti.filter(l => { const c = clienteById(l.clienteId); return c && clienteAttivo(c) && cond(l); }).length;
  const kpi = `<div class="kpi-grid" style="grid-template-columns:repeat(6,1fr);">
    <div class="kpi scaduti"><div class="n">${conta(l => statoFisicoLibro(l) === 'da_fare')}</div><div class="l">DA VIDIMARE IN CCIAA</div></div>
    <div class="kpi inscadenza"><div class="n">${conta(l => statoFisicoLibro(l) === 'vidimati')}</div><div class="l">VIDIMATI, ANCORA VUOTI</div></div>
    <div class="kpi scaduti"><div class="n">${daStampare.filter(x => !x.key.startsWith('vid-')).length}</div><div class="l">VERBALI DA STAMPARE</div></div>
    <div class="kpi completati"><div class="n">${conta(() => true)}</div><div class="l">SOCIETÀ CON LIBRI</div></div>
    <div class="kpi futuri"><div class="n">${conta(l => l.detenutoDa === 'Studio')}</div><div class="l">DETENUTI DALLO STUDIO</div></div>
    <div class="kpi inscadenza"><div class="n">${attiDaTrascrivere().length}</div><div class="l">ATTI DA TRASCRIVERE</div></div>
  </div>`;
  let lista = tutti.filter(l => { const c = clienteById(l.clienteId); return c && (clienteAttivo(c) || LIBRI_FILTRO.cliente === c.id); });
  if (LIBRI_FILTRO.cliente !== 'Tutti') lista = lista.filter(l => l.clienteId === LIBRI_FILTRO.cliente);
  if (LIBRI_FILTRO.detentore !== 'Tutti') lista = lista.filter(l => l.detenutoDa === LIBRI_FILTRO.detentore);
  if (LIBRI_FILTRO.stato && LIBRI_FILTRO.stato !== 'Tutti') lista = lista.filter(l => statoFisicoLibro(l) === LIBRI_FILTRO.stato);
  lista.sort((a, b) => nomeCliente(a.clienteId).localeCompare(nomeCliente(b.clienteId)));
  const toolbar = `<div class="toolbar">
    <div class="field"><label>Cliente</label><select data-action="libri-filtro-cliente"><option value="Tutti">Tutti</option>${STATE.clienti.slice().sort((a, b) => a.ragioneSociale.localeCompare(b.ragioneSociale)).map(c => `<option value="${c.id}" ${LIBRI_FILTRO.cliente === c.id ? 'selected' : ''}>${escapeHtml(c.ragioneSociale)}</option>`).join('')}</select></div>
    <div class="field"><label>Stato dei libri</label><select data-action="libri-filtro-stato"><option value="Tutti">Tutti</option>${STATI_FISICI_LIBRO.map(t => `<option value="${t.v}" ${LIBRI_FILTRO.stato === t.v ? 'selected' : ''}>${escapeHtml(t.corto)}</option>`).join('')}</select></div>
    <div class="field"><label>Detenuto da</label><select data-action="libri-filtro-detentore"><option value="Tutti">Tutti</option>${DETENTORI_LIBRO.map(t => `<option ${LIBRI_FILTRO.detentore === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="field" style="margin-left:auto;"><label>&nbsp;</label><button class="btn primary" data-action="libro-nuovo">+ Aggiungi libro</button></div>
  </div>`;
  if (STATE.clienti.length === 0) return `<div class="card"><div class="empty"><div class="big">Aggiungi prima un cliente</div></div></div>`;
  const clSel = LIBRI_FILTRO.cliente !== 'Tutti' ? clienteById(LIBRI_FILTRO.cliente) : null;
  const extra = clSel ? dettaglioLibriCliente(clSel) : sezioneAttiGlobale();
  if (!lista.length) return kpi + toolbar + htmlStampeLibri(clSel ? clSel.id : null) + `<div class="card"><div class="empty"><div class="big">Nessuna società da mostrare</div>Le società di capitali e le cooperative compaiono qui da sole, con i loro libri sociali.</div></div>` + extra;
  const righe = lista.map(l => {
    const c = clienteById(l.clienteId); const st = infoStatoFisico(statoFisicoLibro(l));
    const nDa = daStampare.filter(x => x.clienteId === l.clienteId && !x.key.startsWith('vid-')).length;
    const sintesi = societaConLibri(c) && l.detenutoDa === 'Studio' ? sintesiStampaLibri(c) : '—';
    return `<tr>
    <td><a href="#" data-action="libri-filtro-apri" data-id="${l.clienteId}"><b>${escapeHtml(nomeCliente(l.clienteId))}</b></a></td>
    <td><span class="badge ${st.cls}">${escapeHtml(st.corto)}</span></td>
    <td><span class="badge ${l.detenutoDa === 'Studio' ? 'stato-da-fare' : 'info'}">${escapeHtml(l.detenutoDa)}</span>${l.detentoreNote ? ` <span class="helptext">${escapeHtml(l.detentoreNote)}</span>` : ''}</td>
    <td>${escapeHtml(sintesi)}</td>
    <td>${nDa ? `<span class="badge stato-da-fare">${nDa}</span>` : '<span class="helptext">—</span>'}</td>
    <td style="white-space:nowrap;">${l.vidimazione ? fmtData(l.vidimazione) : '—'}</td>
    <td style="white-space:nowrap;"><button class="btn small" data-action="libro-modifica" data-id="${l.id}">Modifica</button> <button class="btn small danger" data-action="libro-elimina" data-id="${l.id}">Elimina</button></td>
  </tr>`; }).join('');
  return kpi + toolbar + htmlStampeLibri(clSel ? clSel.id : null) + `<div class="card"><table class="tbl"><thead><tr><th>Società</th><th>Stato dei libri</th><th>Detenuto da</th><th>Stampato fino a</th><th>Da stampare</th><th>Vidimazione</th><th></th></tr></thead><tbody>${righe}</tbody></table></div>` + extra;
}
function modalLibroSociale(id) {
  const ed = id ? (STATE.libriSociali || []).find(x => x.id === id) : null;
  const v = ed || { clienteId: LIBRI_FILTRO.cliente !== 'Tutti' ? LIBRI_FILTRO.cliente : (STATE.clienti[0] || {}).id, tipo: 'Libri sociali', statoFisico: 'in_uso', detenutoDa: 'Studio', detentoreNote: '', ultimaStampa: '', ultimaPagina: '', vidimazione: '', note: '' };
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:540px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>${ed ? 'Modifica libro' : 'Nuovo libro sociale'}</h2></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <form id="formLibro" onsubmit="return false;"><div class="grid2">
        <div class="field full" style="grid-column:1/-1;"><label>Cliente *</label><select id="libCliente">${STATE.clienti.slice().sort((a, b) => a.ragioneSociale.localeCompare(b.ragioneSociale)).map(c => `<option value="${c.id}" ${v.clienteId === c.id ? 'selected' : ''}>${escapeHtml(c.ragioneSociale)}</option>`).join('')}</select></div>
        <div class="field"><label>Stato dei libri</label><select id="libStatoFisico">${STATI_FISICI_LIBRO.map(t => `<option value="${t.v}" ${statoFisicoLibro(v) === t.v ? 'selected' : ''}>${escapeHtml(t.l)}</option>`).join('')}</select></div>
        <div class="field"><label>Detenuto da</label><select id="libDetenuto">${DETENTORI_LIBRO.map(t => `<option ${v.detenutoDa === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="field full" style="grid-column:1/-1;"><label>Dove si trova / note sul detentore</label><input id="libDetNote" value="${escapeHtml(v.detentoreNote || '')}" placeholder="es. armadio sala riunioni, sede legale…"></div>
        <div class="field"><label>Ultima stampa</label><input type="date" id="libStampa" value="${escapeHtml(v.ultimaStampa || '')}"></div>
        <div class="field"><label>Ultima pagina stampata</label><input type="number" min="0" id="libPagina" value="${v.ultimaPagina != null ? v.ultimaPagina : ''}"></div>
        <div class="field"><label>Data vidimazione</label><input type="date" id="libVidim" value="${escapeHtml(v.vidimazione || '')}"></div>
        <div class="field full" style="grid-column:1/-1;"><label>Note</label><input id="libNote" value="${escapeHtml(v.note || '')}"></div>
      </div></form>
      <div class="modal-actions"><button class="btn" data-action="chiudi-modal">Annulla</button><button class="btn primary" data-action="libro-salva" data-id="${ed ? ed.id : ''}">Salva</button></div>
    </div></div>`;
}

/* -------------------- CRUSCOTTO TITOLARE --------------------
   Vista d'insieme per chi dirige lo studio: portafoglio clienti, nuovi e cessati nell'anno, preventivi,
   fatture emesse/incassate, attività da fatturare e — soprattutto — l'avanzamento di ogni adempimento
   annuale FASE per FASE (es. bilanci: quante contabilità chiuse, fascicoli predisposti, comunicati al
   cliente, inviati). Tutto calcolato dai dati già presenti: nessun inserimento in più. Visibile a chi non ha
   il ruolo "limitato" (i limitati vedono solo le sezioni spuntate in Impostazioni › Team). */
function datiCruscotto() {
  const anno = STATE.annoCorrente;
  const inAnno = (iso) => !!iso && String(iso).slice(0, 4) === String(anno);
  const clienti = STATE.clienti;
  const attivi = clienti.filter(c => clienteAttivo(c));
  const perRapporto = (lista) => ({
    continuativo: lista.filter(c => c.tipoRapporto === 'Contratto continuativo').length,
    unaTantum: lista.filter(c => c.tipoRapporto === 'Pratica una tantum').length,
    nd: lista.filter(c => !c.tipoRapporto).length,
  });
  const nuovi = clienti.filter(c => clienteAttivo(c) && inAnno(c.dataIngresso));
  const cessati = clienti.filter(c => c.stato === 'cessato' && inAnno(c.dataCessazione));
  const motivi = {};
  cessati.forEach(c => { const m = c.motivoCessazione || 'Non indicato'; motivi[m] = (motivi[m] || 0) + 1; });
  const prev = STATE.preventivi.filter(p => p.categoria === 'Preventivo' && inAnno(p.dataEmissione));
  const prevAcc = prev.filter(p => p.stato === 'Accettato');
  const somma = (arr, k) => arr.reduce((t, x) => t + (Number(x[k]) || 0), 0);
  const inc = (STATE.incassi || []).filter(i => inAnno(i.dataEmissione));
  const oggi = oggiISO();
  const aperte = (STATE.attivitaFatturabili || []).filter(a => a.stato === 'Da fatturare');
  const { annuali, periodiche, tutteScadenze } = derivati();
  // avanzamento per tipo di adempimento, fase per fase (unione ordinata dei nomi fase)
  const perTipo = new Map();
  annuali.forEach(a => {
    if (!perTipo.has(a.tipoChiave)) perTipo.set(a.tipoChiave, { nome: a.tipoNome, totale: 0, completati: 0, fasi: new Map() });
    const t = perTipo.get(a.tipoChiave);
    t.totale++; if (a.completato) t.completati++;
    a.sotto.forEach(x => {
      if (!t.fasi.has(x.nome)) t.fasi.set(x.nome, { nome: x.nome, fatte: 0, tot: 0, pronte: 0 });
      const f = t.fasi.get(x.nome);
      f.tot++; if (x.completato) f.fatte++; if (x.fase === 'pronta') f.pronte++;
    });
  });
  const cls = classificaScadenze(tutteScadenze, oggi);
  const ritardoPerResp = {};
  cls.scaduti.forEach(x => { const r = x.responsabile || '—'; ritardoPerResp[r] = (ritardoPerResp[r] || 0) + 1; });
  return {
    anno, attivi: attivi.length, rapportoAttivi: perRapporto(attivi), potenziali: clienti.filter(c => c.stato === 'potenziale').length,
    nuovi: nuovi.length, rapportoNuovi: perRapporto(nuovi), cessati: cessati.length, rapportoCessati: perRapporto(cessati), motivi,
    prev: { fatti: prev.length, inviati: prev.filter(p => p.stato === 'Inviato').length, accettati: prevAcc.length, rifiutati: prev.filter(p => p.stato === 'Rifiutato').length, valoreFatto: somma(prev, 'importo'), valoreAccettato: somma(prevAcc, 'importo') },
    fatture: { emesse: inc.length, importoEmesso: somma(inc, 'importo'), incassato: somma(inc, 'importoIncassato'), scadute: inc.filter(i => statoIncasso(i) === 'Scaduto').length },
    daFatturare: { n: aperte.length, importo: somma(aperte, 'importo') },
    adempimenti: Array.from(perTipo.entries()).map(([chiave, t]) => ({ chiave, nome: t.nome, totale: t.totale, completati: t.completati, fasi: Array.from(t.fasi.values()) })),
    scadenze: { scadute: cls.scaduti.length, inScadenza: cls.inScadenza.length, completate: cls.completati.length, futuri: cls.futuri.length, ritardoPerResp },
  };
}
/* Movimento clienti per il cruscotto: entrati/usciti nell'anno, per tipo, regime fiscale e mese,
   con confronto sull'anno precedente. Calcolato dalle date già presenti sulle schede cliente. */
const TIPO_CLIENTE_BREVE = { persona_fisica: 'Pers. fisica', ditta_individuale: 'Ditta individuale', societa_persone: 'Soc. di persone', societa_capitali: 'SRL / SPA', cooperativa: 'Cooperativa', associazione: 'Associazione', impresa_sociale: 'Impresa sociale', altra_forma: 'Altro' };
function movimentoClienti(anno) {
  const y = (iso) => iso ? Number(String(iso).slice(0, 4)) : null;
  const m = (iso) => iso ? Number(String(iso).slice(5, 7)) - 1 : null;
  const calcola = (an) => {
    const ent = STATE.clienti.filter(c => c.stato !== 'potenziale' && y(c.dataIngresso) === an);
    const usc = STATE.clienti.filter(c => c.stato === 'cessato' && y(c.dataCessazione) === an);
    return { ent, usc };
  };
  const cur = calcola(anno), prev = calcola(anno - 1);
  const raggruppa = (chiave, etich) => {
    const mp = new Map();
    const tocca = (c, k) => { const kk = chiave(c) || 'nd'; if (!mp.has(kk)) mp.set(kk, { chiave: kk, label: etich(kk), nuovi: 0, usciti: 0 }); mp.get(kk)[k]++; };
    cur.ent.forEach(c => tocca(c, 'nuovi')); cur.usc.forEach(c => tocca(c, 'usciti'));
    return Array.from(mp.values()).sort((a, b) => (b.nuovi + b.usciti) - (a.nuovi + a.usciti));
  };
  const mesi = MESI_BREVI.map((l, i) => ({ label: l, nuovi: cur.ent.filter(c => m(c.dataIngresso) === i).length, usciti: cur.usc.filter(c => m(c.dataCessazione) === i).length }));
  const motivi = {}; cur.usc.forEach(c => { const k = c.motivoCessazione || 'Non indicato'; motivi[k] = (motivi[k] || 0) + 1; });
  const att = STATE.clienti.filter(c => clienteAttivo(c));
  const conta = (lista, f) => { const o = {}; lista.forEach(c => { const k = f(c) || 'nd'; o[k] = (o[k] || 0) + 1; }); return o; };
  return {
    nuovi: cur.ent.length, usciti: cur.usc.length, nuoviPrev: prev.ent.length, uscitiPrev: prev.usc.length,
    perTipo: raggruppa(c => c.tipo, k => TIPO_CLIENTE_BREVE[k] || 'Non indicato'),
    perRegime: raggruppa(c => c.regimeFiscale, k => k === 'nd' ? 'Non indicato' : k),
    mesi, motivi,
    portTipo: conta(att, c => c.tipo), portRegime: conta(att, c => c.regimeFiscale),
  };
}
const PALETTE_GRAFICI = ['#2457D6', '#22A6C4', '#8B5CF6', '#E39B0C', '#1B7A43', '#D6406E', '#6B7C93', '#B45309'];
function barreDivergenti(righe) {
  const max = Math.max(1, ...righe.map(r => Math.max(r.nuovi, r.usciti)));
  if (!righe.length) return '<div class="empty">Nessun movimento nell\'anno.</div>';
  return `<div style="display:grid;gap:9px;">
    <div style="display:grid;grid-template-columns:1fr 130px 1fr 54px;font-size:11px;color:var(--text-mut);font-weight:700;text-transform:uppercase;"><div style="text-align:right;">← Usciti</div><div></div><div>Entrati →</div><div style="text-align:right;">Saldo</div></div>
    ${righe.map(r => { const s = r.nuovi - r.usciti; return `<div style="display:grid;grid-template-columns:1fr 130px 1fr 54px;align-items:center;gap:0;" title="${escapeHtml(r.label)}: +${r.nuovi} entrati, −${r.usciti} usciti">
      <div style="display:flex;justify-content:flex-end;align-items:center;gap:6px;">${r.usciti ? `<span style="font-size:12px;font-weight:700;color:var(--rosso);">${r.usciti}</span>` : ''}<div style="height:16px;width:${(r.usciti / max * 100).toFixed(1)}%;background:linear-gradient(270deg,var(--rosso),#f0867f);border-radius:4px 0 0 4px;transition:width .5s;"></div></div>
      <div style="text-align:center;font-size:12.5px;font-weight:600;padding:0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(r.label)}</div>
      <div style="display:flex;align-items:center;gap:6px;"><div style="height:16px;width:${(r.nuovi / max * 100).toFixed(1)}%;background:linear-gradient(90deg,var(--verde),#5fc48a);border-radius:0 4px 4px 0;transition:width .5s;"></div>${r.nuovi ? `<span style="font-size:12px;font-weight:700;color:var(--verde);">${r.nuovi}</span>` : ''}</div>
      <div style="text-align:right;font-size:12.5px;font-weight:800;color:${s > 0 ? 'var(--verde)' : (s < 0 ? 'var(--rosso)' : 'var(--text-mut)')};">${s > 0 ? '+' : ''}${s}</div>
    </div>`; }).join('')}
  </div>`;
}
function graficoMovimentoMesi(mesi) {
  const w = 520, hh = 150, base = 120, top = 18, bw = w / 12;
  const max = Math.max(1, ...mesi.map(x => Math.max(x.nuovi, x.usciti)));
  const sc = (base - top) / max;
  const barre = mesi.map((x, i) => {
    const x0 = i * bw + bw * 0.14, lw = bw * 0.34;
    const hn = x.nuovi * sc, hu = x.usciti * sc;
    return `<g><title>${x.label}: +${x.nuovi} entrati, −${x.usciti} usciti</title>
      <rect x="${x0.toFixed(1)}" y="${(base - hn).toFixed(1)}" width="${lw.toFixed(1)}" height="${hn.toFixed(1)}" rx="2" fill="var(--verde)"></rect>
      <rect x="${(x0 + lw + 2).toFixed(1)}" y="${(base - hu).toFixed(1)}" width="${lw.toFixed(1)}" height="${hu.toFixed(1)}" rx="2" fill="var(--rosso)"></rect>
      ${x.nuovi ? `<text x="${(x0 + lw / 2).toFixed(1)}" y="${(base - hn - 3).toFixed(1)}" font-size="9" font-weight="700" text-anchor="middle" fill="var(--verde)">${x.nuovi}</text>` : ''}
      ${x.usciti ? `<text x="${(x0 + lw * 1.5 + 2).toFixed(1)}" y="${(base - hu - 3).toFixed(1)}" font-size="9" font-weight="700" text-anchor="middle" fill="var(--rosso)">${x.usciti}</text>` : ''}
      <text x="${(i * bw + bw / 2).toFixed(1)}" y="${hh - 10}" font-size="9.5" text-anchor="middle" fill="var(--text-mut)">${x.label}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${hh}" width="100%" style="max-height:190px;"><line x1="0" y1="${base}" x2="${w}" y2="${base}" stroke="var(--border)" stroke-width="1.5"></line>${barre}</svg>
    <div style="display:flex;gap:16px;font-size:12px;color:var(--text-mut);margin-top:2px;"><span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--verde);margin-right:5px;"></span>Entrati</span><span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--rosso);margin-right:5px;"></span>Usciti</span></div>`;
}
function donutDaConteggio(obj, etich) {
  const punti = Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, n], i) => ({ label: etich(k), valore: n, colore: PALETTE_GRAFICI[i % PALETTE_GRAFICI.length] }));
  return graficoDonutSvg(punti, (n) => String(n));
}
function frecciaVar(cur, prev, invertita) {
  const d = cur - prev;
  if (!prev && !cur) return '';
  const bene = invertita ? d < 0 : d > 0;
  const col = d === 0 ? 'var(--text-mut)' : (bene ? 'var(--verde)' : 'var(--rosso)');
  return `<div style="font-size:11.5px;font-weight:600;color:${col};margin-top:2px;">${d > 0 ? '▲' : (d < 0 ? '▼' : '=')} ${d > 0 ? '+' : ''}${d} sull'anno prima (${prev})</div>`;
}
function sezioneClientiGrafica(d) {
  const mv = movimentoClienti(d.anno);
  const saldo = mv.nuovi - mv.usciti;
  const kpiG = (n, l, cls, extra) => `<div class="kpi ${cls}"><div class="n">${n}</div><div class="l">${l}</div>${extra || ''}</div>`;
  const motiviHtml = Object.keys(mv.motivi).length ? donutDaConteggio(mv.motivi, k => k) : '<div class="helptext">Nessuna cessazione nell\'anno.</div>';
  return `<div class="card"><div class="section-title">Come si muove il portafoglio clienti — ${d.anno}</div>
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
      ${kpiG(d.attivi, 'CLIENTI ATTIVI', 'completati')}
      ${kpiG(mv.nuovi, 'ENTRATI NELL\'ANNO', 'futuri', frecciaVar(mv.nuovi, mv.nuoviPrev, false))}
      ${kpiG(mv.usciti, 'USCITI NELL\'ANNO', 'scaduti', frecciaVar(mv.usciti, mv.uscitiPrev, true))}
      ${kpiG((saldo > 0 ? '+' : '') + saldo, 'SALDO NETTO', saldo >= 0 ? 'futuri' : 'scaduti')}
    </div>
    <div class="helptext" style="margin-top:8px;">${saldo < 0 ? 'Il portafoglio si sta riducendo: guarda sotto che tipo di clienti stai perdendo.' : (saldo > 0 ? 'Il portafoglio sta crescendo.' : 'Entrate e uscite si bilanciano.')} Se entrano società di capitali e escono forfettari il saldo può essere uguale ma il valore dello studio no: per questo qui sono divisi per tipo.</div>
  </div>
  <div class="card"><div class="section-title">Entrati e usciti per tipo di cliente</div>${barreDivergenti(mv.perTipo)}</div>
  <div class="card"><div class="section-title">Entrati e usciti per regime fiscale</div>${barreDivergenti(mv.perRegime)}</div>
  <div class="card"><div class="section-title">Mese per mese</div>${graficoMovimentoMesi(mv.mesi)}</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;">
    <div class="card"><div class="section-title">Portafoglio attuale per tipo</div>${donutDaConteggio(mv.portTipo, k => TIPO_CLIENTE_BREVE[k] || 'Non indicato')}</div>
    <div class="card"><div class="section-title">Portafoglio attuale per regime</div>${donutDaConteggio(mv.portRegime, k => k === 'nd' ? 'Non indicato' : k)}</div>
    <div class="card"><div class="section-title">Perché se ne vanno</div>${motiviHtml}</div>
  </div>`;
}
function renderCruscotto() {
  const d = datiCruscotto();
  const bar = (n, tot) => `<div class="progress" style="width:100%;"><div style="width:${tot ? Math.round(n / tot * 100) : 0}%"></div></div>`;
  const kpi = (n, l, cls) => `<div class="kpi ${cls || 'completati'}"><div class="n">${n}</div><div class="l">${l}</div></div>`;
  const rapp = (r) => `<span class="helptext">${r.continuativo} continuativi · ${r.unaTantum} una tantum${r.nd ? ' · ' + r.nd + ' non indicati' : ''}</span>`;
  const sezClienti = `<div class="card"><div class="section-title">Clienti — ${d.anno}</div>
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
      ${kpi(d.attivi, 'CLIENTI ATTIVI')}${kpi(d.nuovi, 'NUOVI NELL\'ANNO', 'futuri')}${kpi(d.cessati, 'CESSATI NELL\'ANNO', 'scaduti')}${kpi(d.potenziali, 'POTENZIALI (PREVENTIVI)', 'inscadenza')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:8px;">
      <div><div class="helptext"><strong>Portafoglio</strong></div>${rapp(d.rapportoAttivi)}</div>
      <div><div class="helptext"><strong>Nuovi</strong></div>${rapp(d.rapportoNuovi)}</div>
      <div><div class="helptext"><strong>Cessati</strong></div>${rapp(d.rapportoCessati)}${Object.keys(d.motivi).length ? '<div class="helptext">' + Object.entries(d.motivi).map(([m, n]) => escapeHtml(m) + ': ' + n).join(' · ') + '</div>' : ''}</div>
    </div></div>`;
  const conv = d.prev.fatti ? Math.round(d.prev.accettati / d.prev.fatti * 100) + '%' : '—';
  const sezPrev = `<div class="card"><div class="section-title">Preventivi — ${d.anno}</div>
    <div class="kpi-grid" style="grid-template-columns:repeat(5,1fr);">
      ${kpi(d.prev.fatti, 'FATTI')}${kpi(d.prev.inviati, 'IN ATTESA (INVIATI)', 'inscadenza')}${kpi(d.prev.accettati, 'ACCETTATI', 'futuri')}${kpi(d.prev.rifiutati, 'RIFIUTATI', 'scaduti')}${kpi(conv, 'TASSO DI ACCETTAZIONE')}
    </div>
    <div class="helptext" style="margin-top:6px;">Valore preventivato ${fmtEuro(d.prev.valoreFatto)} · accettato ${fmtEuro(d.prev.valoreAccettato)}</div></div>`;
  const sezFatt = `<div class="card"><div class="section-title">Fatture e incassi — ${d.anno}</div>
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
      ${kpi(d.fatture.emesse, 'FATTURE EMESSE')}${kpi(fmtEuro(d.fatture.importoEmesso), 'IMPORTO EMESSO', 'futuri')}${kpi(fmtEuro(d.fatture.incassato), 'INCASSATO', 'futuri')}${kpi(d.fatture.scadute, 'SCADUTE NON INCASSATE', 'scaduti')}
    </div>
    <div class="helptext" style="margin-top:6px;">Residuo da incassare ${fmtEuro(d.fatture.importoEmesso - d.fatture.incassato)} · Attività extra ancora da fatturare: <strong>${d.daFatturare.n}</strong>${d.daFatturare.importo ? ' (' + fmtEuro(d.daFatturare.importo) + ' stimati)' : ''}</div></div>`;
  const righeAdm = d.adempimenti.length ? d.adempimenti.map(t => `<div style="padding:12px 0;border-bottom:1px solid var(--border);">
      <div style="display:flex;justify-content:space-between;align-items:center;"><strong>${escapeHtml(t.nome)}</strong><span class="helptext">${t.completati}/${t.totale} completati</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px 16px;margin-top:8px;">
        ${t.fasi.map(f => `<div><div style="display:flex;justify-content:space-between;font-size:12px;"><span>${escapeHtml(f.nome)}</span><strong>${f.fatte}/${f.tot}</strong></div>${bar(f.fatte, f.tot)}<div class="helptext" style="font-size:10.5px;">${f.tot - f.fatte} da fare${f.pronte ? ' · ' + f.pronte + ' pronte per iniziare' : ''}</div></div>`).join('')}
      </div></div>`).join('') : '<div class="empty">Nessun adempimento annuale applicabile.</div>';
  const sezAdm = `<div class="card"><div class="section-title">Avanzamento adempimenti per fase — ${d.anno}</div>${righeAdm}</div>`;
  const rit = Object.entries(d.scadenze.ritardoPerResp).sort((a, b) => b[1] - a[1]);
  const sezScad = `<div class="card"><div class="section-title">Scadenze periodiche</div>
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
      ${kpi(d.scadenze.scadute, 'IN RITARDO', 'scaduti')}${kpi(d.scadenze.inScadenza, 'ENTRO 30 GIORNI', 'inscadenza')}${kpi(d.scadenze.futuri, 'FUTURE', 'futuri')}${kpi(d.scadenze.completate, 'COMPLETATE')}
    </div>${rit.length ? '<div class="helptext" style="margin-top:6px;">Ritardi per responsabile: ' + rit.map(([r, n]) => escapeHtml(r) + ' ' + n).join(' · ') + '</div>' : ''}</div>`;
  return `<div class="helptext" style="margin-bottom:8px;">Anno di riferimento: ${d.anno} (cambialo dal selettore anno in alto).</div>` + sezioneClientiGrafica(d) + sezPrev + sezFatt + sezAdm + sezScad;
}

/* -------------------- DEONTOLOGIA (Codice deontologico dei dottori commercialisti, ed. 2024 + modifiche 2025 sull'IA) --------------------
   Supporto organizzativo, non consulenza: le voci sono promemoria dei doveri tipici (accettazione incarico,
   equo compenso, riservatezza, formazione, uso dell'IA). Soglie e regole vanno SEMPRE verificate sulle fonti
   ufficiali (CNDCEC, L. 49/2023 sull'equo compenso). */
const VOCI_ACCETTAZIONE = [
  { k: 'indipendenza', t: 'Verificata l\'assenza di conflitti di interesse e la propria indipendenza (anche solo apparente)' },
  { k: 'legalita', t: 'Verificata la compatibilità dell\'incarico con la legge e l\'assenza di indizi di operazioni illecite' },
  { k: 'competenza', t: 'Valutata la propria competenza e la complessità della prestazione (riflessa nel preventivo)' },
  { k: 'informativa', t: 'Informato il cliente su diritti/doveri reciproci e sull\'esistenza del Codice deontologico' },
  { k: 'polizza', t: 'Comunicati al cliente gli estremi della polizza RC professionale' },
  { k: 'ia', t: 'Informato il cliente sull\'eventuale uso di strumenti di intelligenza artificiale a supporto' },
  { k: 'adeguataVerifica', t: 'Avviata l\'adeguata verifica antiriciclaggio (vedi Antiriciclaggio)' },
];
const VOCE_EQUO_COMPENSO = { k: 'equoCompenso', t: 'Cliente "forte": verificata la conformità del compenso ai parametri (equo compenso)' };
const FPC_CREDITI_TRIENNIO = 90, FPC_CREDITI_OBBLIGATORI = 9;
function accettazioneCliente(id) {
  if (!STATE.accettazioni) STATE.accettazioni = {};
  if (!STATE.accettazioni[id]) STATE.accettazioni[id] = { voci: {}, clienteForte: false, note: '', data: null };
  return STATE.accettazioni[id];
}
function aggiornaAccettazione(id, patch) {
  const a = accettazioneCliente(id);
  if (patch.voci) a.voci = Object.assign({}, a.voci, patch.voci);
  ['clienteForte', 'note', 'data'].forEach(k => { if (k in patch) a[k] = patch[k]; });
  salvaStato();
  return a;
}
function accettazioneCompleta(id) {
  const a = (STATE.accettazioni || {})[id];
  if (!a) return false;
  const voci = VOCI_ACCETTAZIONE.concat(a.clienteForte ? [VOCE_EQUO_COMPENSO] : []);
  return voci.every(v => a.voci[v.k]);
}
function triennioFpc(dataISO) {
  const y = Number(String(dataISO || oggiISO()).slice(0, 4));
  const inizio = 2023 + Math.floor((y - 2023) / 3) * 3;
  return { inizio, fine: inizio + 2 };
}
function riepilogoFpc(persona) {
  const tr = triennioFpc(oggiISO());
  const ev = (STATE.fpc || []).filter(e => e.persona === persona && Number(String(e.data).slice(0, 4)) >= tr.inizio && Number(String(e.data).slice(0, 4)) <= tr.fine);
  const tot = ev.reduce((t, e) => t + (Number(e.crediti) || 0), 0);
  const obb = ev.filter(e => e.obbligatoria).reduce((t, e) => t + (Number(e.crediti) || 0), 0);
  return { tr, tot, obb, ev };
}
function registroIaCsv() {
  const rig = [['Data', 'Operatore', 'Azione', 'Esito', 'Dettagli']].concat((STATE.auditMcp || []).map(a => [a.data, a.operatore || '', etichettaAzioneMCP(a.azione), a.esito, (a.errore || a.parametri || '').replace(/\s+/g, ' ')]));
  return rig.map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';')).join('\n');
}
let DEON_TAB = 'accettazione', DEON_CLIENTE = null;
function renderDeontologia() {
  const tabs = [['accettazione', 'Accettazione incarico'], ['ia', 'Registro uso IA'], ['fpc', 'Formazione continua'], ['riservatezza', 'Riservatezza'], ['privacy', 'Privacy e sicurezza'], ['testi', 'Testi standard']];
  const nav = `<div class="toolbar" style="gap:6px;">${tabs.map(([k, l]) => `<button class="btn ${DEON_TAB === k ? 'primary' : ''}" data-action="deon-tab" data-tab="${k}">${l}</button>`).join('')}</div>`;
  const avviso = `<div class="helptext" style="margin-bottom:10px;">Promemoria organizzativi basati sul Codice deontologico dei dottori commercialisti: non sostituiscono la lettura delle fonti ufficiali né il tuo giudizio professionale.</div>`;
  let corpo = '';
  if (DEON_TAB === 'accettazione') {
    const clienti = STATE.clienti.filter(c => c.stato !== 'cessato').sort((a, b) => a.ragioneSociale.localeCompare(b.ragioneSociale));
    if (!clienti.length) corpo = '<div class="card"><div class="empty">Aggiungi prima un cliente.</div></div>';
    else {
      if (!DEON_CLIENTE || !clienti.some(c => c.id === DEON_CLIENTE)) DEON_CLIENTE = clienti[0].id;
      const a = accettazioneCliente(DEON_CLIENTE);
      const voci = VOCI_ACCETTAZIONE.concat(a.clienteForte ? [VOCE_EQUO_COMPENSO] : []);
      const fatte = voci.filter(v => a.voci[v.k]).length;
      const aperti = clienti.filter(c => !accettazioneCompleta(c.id)).length;
      corpo = `<div class="card"><div class="toolbar"><div class="field grow"><label>Cliente</label><select data-action="deon-acc-cliente">${clienti.map(c => `<option value="${c.id}" ${c.id === DEON_CLIENTE ? 'selected' : ''}>${escapeHtml(c.ragioneSociale)}${accettazioneCompleta(c.id) ? ' ✓' : ''}</option>`).join('')}</select></div>
        <div class="helptext">${aperti} clienti con check-list incompleta</div></div>
        <label class="checkline" style="display:block;margin:8px 0;"><input type="checkbox" data-action="deon-acc-forte" ${a.clienteForte ? 'checked' : ''}> Cliente "forte" (banca, assicurazione, impresa con oltre 50 dipendenti o oltre 10 mln di ricavi): applica l'equo compenso. <span class="helptext">Verifica la soglia sulla L. 49/2023.</span></label>
        <div class="progress" style="margin:6px 0;"><div style="width:${Math.round(fatte / voci.length * 100)}%"></div></div>
        ${voci.map(v => `<label class="checkline" style="display:block;padding:4px 0;"><input type="checkbox" data-action="deon-acc-toggle" data-k="${v.k}" ${a.voci[v.k] ? 'checked' : ''}> ${escapeHtml(v.t)}</label>`).join('')}
        <div class="field" style="margin-top:8px;"><label>Note</label><input data-action="deon-acc-note" value="${escapeHtml(a.note || '')}" placeholder="es. esito della verifica sui conflitti"></div>
        ${a.data ? `<div class="helptext">Check-list completata il ${fmtData(a.data)}</div>` : ''}</div>`;
    }
  } else if (DEON_TAB === 'ia') {
    const reg = (STATE.auditMcp || []).slice().reverse();
    corpo = `<div class="card"><div class="section-title">Registro uso IA <span class="cnt">${reg.length}</span></div>
      <div class="helptext" style="margin-bottom:8px;">Tutto ciò che Claude fa in Prisma tramite MCP viene registrato (chi, quando, quale azione). Utile per documentare l'uso dell'IA come strumento di supporto e dimostrare che il giudizio resta al professionista.</div>
      <button class="btn small" data-action="deon-ia-esporta">⬇ Esporta registro (CSV)</button>
      ${reg.length ? `<table class="compact" style="margin-top:8px;"><thead><tr><th>Quando</th><th>Operatore</th><th>Azione</th><th>Esito</th></tr></thead><tbody>${reg.slice(0, 100).map(a => `<tr><td style="white-space:nowrap;">${fmtDataOra(a.data)}</td><td>${escapeHtml(a.operatore || '—')}</td><td>${escapeHtml(etichettaAzioneMCP(a.azione))}</td><td>${escapeHtml(a.esito)}</td></tr>`).join('')}</tbody></table>` : '<div class="helptext" style="margin-top:8px;">Nessuna azione registrata finora.</div>'}</div>`;
  } else if (DEON_TAB === 'fpc') {
    const tr = triennioFpc(oggiISO());
    const persone = STATE.meta.responsabili || [];
    corpo = `<div class="card"><div class="section-title">Formazione professionale continua — triennio ${tr.inizio}-${tr.fine}</div>
      <div class="helptext" style="margin-bottom:8px;">Obiettivo ${FPC_CREDITI_TRIENNIO} crediti nel triennio, di cui almeno ${FPC_CREDITI_OBBLIGATORI} in materie obbligatorie (ordinamento, deontologia, organizzazione dello studio, antiriciclaggio, mediazione). <strong>Da verificare sul regolamento CNDCEC in vigore.</strong></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;">${persone.map(p => { const r = riepilogoFpc(p); return `<div style="border:1px solid var(--border);border-radius:8px;padding:10px;"><strong>${escapeHtml(p)}</strong><div class="helptext">${r.tot}/${FPC_CREDITI_TRIENNIO} crediti · ${r.obb}/${FPC_CREDITI_OBBLIGATORI} obbligatori</div><div class="progress"><div style="width:${Math.min(100, Math.round(r.tot / FPC_CREDITI_TRIENNIO * 100))}%"></div></div></div>`; }).join('')}</div>
      <div style="margin:12px 0;"><button class="btn primary" data-action="deon-fpc-nuovo">+ Registra evento formativo</button></div>
      ${(STATE.fpc || []).length ? `<table class="compact"><thead><tr><th>Data</th><th>Persona</th><th>Evento</th><th>Crediti</th><th>Materia obbl.</th><th></th></tr></thead><tbody>${(STATE.fpc || []).slice().sort((a, b) => b.data.localeCompare(a.data)).map(e => `<tr><td>${fmtData(e.data)}</td><td>${escapeHtml(e.persona)}</td><td>${escapeHtml(e.titolo)}</td><td>${e.crediti}</td><td>${e.obbligatoria ? 'Sì' : '—'}</td><td><button class="btn small danger" data-action="deon-fpc-elimina" data-id="${e.id}">Elimina</button></td></tr>`).join('')}</tbody></table>` : ''}</div>`;
  } else if (DEON_TAB === 'riservatezza') {
    const lista = (STATE.impegniRiservatezza || []).slice().sort((a, b) => (a.persona || '').localeCompare(b.persona || ''));
    const oggi = oggiISO();
    corpo = `<div class="card"><div class="section-title">Impegni di riservatezza e nomine privacy</div>
      <div class="helptext" style="margin-bottom:8px;">Registro di chi ha firmato cosa (collaboratori, praticanti, fornitori): il professionista risponde della vigilanza su chi collabora con lo studio.</div>
      <button class="btn primary" data-action="deon-riserv-nuovo">+ Registra impegno</button>
      ${lista.length ? `<table class="compact" style="margin-top:8px;"><thead><tr><th>Persona</th><th>Documento</th><th>Firmato il</th><th>Scadenza</th><th></th></tr></thead><tbody>${lista.map(i => `<tr><td>${escapeHtml(i.persona)}</td><td>${escapeHtml(i.tipo)}</td><td>${i.data ? fmtData(i.data) : '—'}</td><td>${i.scadenza ? fmtData(i.scadenza) + (i.scadenza < oggi ? ' <span class="badge stato-errore">scaduto</span>' : '') : '—'}</td><td><button class="btn small danger" data-action="deon-riserv-elimina" data-id="${i.id}">Elimina</button></td></tr>`).join('')}</tbody></table>` : ''}
      <div class="helptext" style="margin-top:8px;">Persone dello studio senza alcun impegno registrato: ${((STATE.meta.responsabili || []).filter(p => !lista.some(i => i.persona === p)).map(escapeHtml).join(', ')) || 'nessuna'}</div></div>`;
  } else if (DEON_TAB === 'privacy') {
    const nOp = (STATE.meta.responsabili || []).length;
    const nLim = (STATE.meta.responsabili || []).filter(r => ruoloOperatore(r) === 'limitato').length;
    const info = `Lo studio tratta i dati dei clienti per l'esecuzione degli incarichi e per gli obblighi di legge (Reg. UE 2016/679). I dati sono conservati sui sistemi dello studio, con accessi riservati al personale autorizzato, credenziali conservate in forma cifrata e copie di sicurezza periodiche. I dati non sono ceduti a terzi, salvo i fornitori necessari al servizio e gli obblighi di legge. Il cliente può esercitare i diritti previsti dagli artt. 15-22 GDPR scrivendo allo studio.`;
    corpo = `<div class="card"><div class="section-title">Misure di sicurezza adottate</div>
      <div class="helptext" style="margin-bottom:8px;">Scheda di sintesi per il registro dei trattamenti e per le richieste dei clienti. Verifica che corrisponda alla tua realtà prima di usarla.</div>
      <ul style="margin:0 0 0 18px;line-height:1.7;">
        <li>Dati archiviati in locale sul computer/server dello studio (nessun cloud del fornitore del software).</li>
        <li>Password delle credenziali conservate cifrate (AES-256-GCM); la chiave è inclusa nelle copie di sicurezza locali.</li>
        <li>Accessi: ${nOp} utenti configurati, di cui ${nLim} con ruolo limitato alle sezioni consentite.</li>
        <li>Tracciamento di tutte le azioni dell'IA (Registro uso IA) con possibilità di conferma preventiva.</li>
        <li>Backup automatico e copia esterna configurabili da Impostazioni › Dati.</li>
        <li>Portale cliente: accessi con password, solo se attivato l'accesso esterno.</li></ul>
      <div class="field full" style="margin-top:10px;"><label>Testo per l'informativa ai clienti</label><textarea rows="5" style="width:100%;" readonly>${escapeHtml(info)}</textarea></div></div>`;
  } else {
    const clausolaIa = `Lo studio può avvalersi di strumenti di intelligenza artificiale come supporto ad attività di analisi, ricerca e organizzazione del lavoro. Le valutazioni, i pareri e le scelte professionali restano sempre di esclusiva responsabilità del Professionista, che verifica ogni risultato prodotto con tali strumenti.`;
    const impRis = `Il sottoscritto si impegna a mantenere la più rigorosa riservatezza su tutte le informazioni apprese in occasione dell'attività svolta per lo studio, a non comunicarle a terzi e a trattare i dati personali solo nei limiti delle istruzioni ricevute, anche dopo la cessazione del rapporto.`;
    corpo = `<div class="card"><div class="section-title">Testi standard</div>
      <div class="helptext" style="margin-bottom:8px;">Testi pronti da copiare (la clausola IA e le informative sul Codice sono già nel modello "Lettera di incarico strutturata"; la lettera di rinuncia è tra i modelli base).</div>
      <div class="field full"><label>Clausola sull'uso dell'IA</label><textarea rows="3" style="width:100%;" readonly>${escapeHtml(clausolaIa)}</textarea></div>
      <div class="field full" style="margin-top:8px;"><label>Impegno di riservatezza per collaboratori</label><textarea rows="3" style="width:100%;" readonly>${escapeHtml(impRis)}</textarea></div></div>`;
  }
  return avviso + nav + corpo;
}
function modalFpc() {
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop"><div class="modal" style="max-width:480px;">
    <div style="display:flex;justify-content:space-between;"><h2>Evento formativo</h2><button class="icon-x" data-action="chiudi-modal">✕</button></div>
    <form onsubmit="return false;"><div class="grid2">
      <div class="field"><label>Persona</label><select id="fpcPersona">${(STATE.meta.responsabili || []).map(p => `<option>${escapeHtml(p)}</option>`).join('')}</select></div>
      <div class="field"><label>Data</label><input type="date" id="fpcData" value="${oggiISO()}"></div>
      <div class="field full" style="grid-column:1/-1;"><label>Evento *</label><input id="fpcTitolo"></div>
      <div class="field"><label>Crediti *</label><input type="number" min="0" step="0.5" id="fpcCrediti"></div>
      <div class="field"><label>&nbsp;</label><label class="checkline"><input type="checkbox" id="fpcObb"> Materia obbligatoria</label></div>
    </div></form>
    <div class="modal-actions"><button class="btn" data-action="chiudi-modal">Annulla</button><button class="btn primary" data-action="deon-fpc-salva">Salva</button></div></div></div>`;
}
function modalRiservatezza() {
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop"><div class="modal" style="max-width:480px;">
    <div style="display:flex;justify-content:space-between;"><h2>Impegno di riservatezza</h2><button class="icon-x" data-action="chiudi-modal">✕</button></div>
    <form onsubmit="return false;"><div class="grid2">
      <div class="field full" style="grid-column:1/-1;"><label>Persona *</label><input id="rsPersona" list="rsPers" placeholder="nome e cognome"><datalist id="rsPers">${(STATE.meta.responsabili || []).map(p => `<option value="${escapeHtml(p)}">`).join('')}</datalist></div>
      <div class="field"><label>Documento</label><select id="rsTipo"><option>Impegno di riservatezza</option><option>Nomina incaricato al trattamento</option><option>Nomina responsabile esterno</option></select></div>
      <div class="field"><label>Firmato il</label><input type="date" id="rsData" value="${oggiISO()}"></div>
      <div class="field"><label>Scadenza (opzionale)</label><input type="date" id="rsScad"></div>
    </div></form>
    <div class="modal-actions"><button class="btn" data-action="chiudi-modal">Annulla</button><button class="btn primary" data-action="deon-riserv-salva">Salva</button></div></div></div>`;
}

/* -------------------- CARICO DI LAVORO, PROROGHE, CPB -------------------- */
const MESI_BREVI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
/* Carico = scadenze periodiche non chiuse + adempimenti annuali non completati, per responsabile e mese di scadenza. */
function datiCarico() {
  const { tutteScadenze, annuali } = derivati();
  const resp = Array.from(new Set((STATE.meta.responsabili || []).concat(['—'])));
  const m = {}; resp.forEach(r => { m[r] = { aperte: Array(12).fill(0), chiuse: Array(12).fill(0) }; });
  const add = (r, iso, chiusa) => { if (!iso) return; const mi = Number(iso.slice(5, 7)) - 1; const k = m[r || '—'] ? (r || '—') : '—'; (chiusa ? m[k].chiuse : m[k].aperte)[mi]++; };
  tutteScadenze.forEach(sc => add(sc.responsabile, sc.data, STATI_SCADENZA_CHIUSI.includes(sc.stato)));
  annuali.forEach(a => add(a.responsabile, a.scadenza, a.completato));
  return { resp: resp.filter(r => m[r].aperte.some(x => x) || m[r].chiuse.some(x => x)), m };
}
function renderCarico() {
  const d = datiCarico();
  const max = Math.max(1, ...d.resp.flatMap(r => d.m[r].aperte));
  const oggiM = new Date().getMonth();
  const righe = d.resp.map(r => `<tr><td style="white-space:nowrap;font-weight:600;">${escapeHtml(r)}</td>${d.m[r].aperte.map((n, i) => `<td style="text-align:center;background:rgba(220,80,60,${n ? (0.1 + 0.6 * n / max).toFixed(2) : 0});${i === oggiM ? 'outline:2px solid var(--blu-mid);' : ''}" title="${n} aperte, ${d.m[r].chiuse[i]} chiuse">${n || ''}</td>`).join('')}<td style="text-align:center;font-weight:700;">${d.m[r].aperte.reduce((a, b) => a + b, 0)}</td></tr>`).join('');
  return `<div class="helptext" style="margin-bottom:8px;">Scadenze periodiche e adempimenti annuali ancora aperti, per responsabile e mese di scadenza (anno ${STATE.annoCorrente}). Calcolato dai dati già presenti: nessun timesheet. Più è scuro, più lavoro si concentra: serve a bilanciare i picchi (marzo-giugno) prima che arrivino.</div>
    <div class="card" style="overflow:auto;"><table class="tbl"><thead><tr><th>Persona</th>${MESI_BREVI.map(x => `<th style="text-align:center;">${x}</th>`).join('')}<th>Tot.</th></tr></thead><tbody>${righe || '<tr><td colspan="14" class="helptext">Nessuna scadenza.</td></tr>'}</tbody></table></div>`;
}
function opzioniProroga() {
  const { periodiche, annuali } = derivati();
  const mappa = new Map();
  periodiche.forEach(sc => { const dataO = sc.dataOriginale || sc.data; const k = sc.tipo + '|' + dataO; if (!mappa.has(k)) mappa.set(k, { tipo: sc.tipo, dataOriginale: dataO, clienti: new Set() }); mappa.get(k).clienti.add(sc.clienteId); });
  const out = Array.from(mappa.values());
  const defA = catalogoAnnualeTutti();
  annuali.forEach(a => { const def = defA.find(x => x.chiave === a.tipoChiave); if (!def) return; const orig = def.scadenzaDefault ? dataScadenza(a.anno, def.scadenzaDefault.m, def.scadenzaDefault.g) : null; if (!orig) return; const k = a.tipoNome + '|' + orig; let o = out.find(x => x.tipo === a.tipoNome && x.dataOriginale === orig); if (!o) { o = { tipo: a.tipoNome, dataOriginale: orig, clienti: new Set() }; out.push(o); } o.clienti.add(a.clienteId); });
  return out.sort((a, b) => a.dataOriginale.localeCompare(b.dataOriginale) || a.tipo.localeCompare(b.tipo));
}
function aggiungiProroga(d) {
  const p = Object.assign({ id: uid('pro'), creatoIl: oggiISO(), clienteIds: null, motivo: '' }, d);
  STATE.proroghe.push(p); salvaStato(); return p;
}
function eliminaProroga(id) { STATE.proroghe = (STATE.proroghe || []).filter(x => x.id !== id); salvaStato(); }
/* Clienti (id) che hanno la scadenza a cui si riferisce una proroga. */
function clientiDiProroga(p) {
  const o = opzioniProroga().find(x => x.tipo === p.tipo && x.dataOriginale === p.dataOriginale);
  return o ? Array.from(o.clienti) : [];
}
function aderentiProroga(p) {
  const tutti = clientiDiProroga(p);
  return p.clienteIds ? tutti.filter(id => p.clienteIds.includes(id)) : tutti;
}
function renderProroghe() {
  const opz = opzioniProroga();
  const attive = STATE.proroghe || [];
  const form = `<div class="card"><div class="section-title">Nuova proroga</div>
    <div class="helptext" style="margin-bottom:8px;">Scegli la scadenza e la nuova data. Subito dopo scegli <b>quali clienti aderiscono</b>: non tutti si avvalgono della proroga (chi paga alla data ordinaria, chi alla prima proroga, chi alla seconda). Più proroghe sulla stessa scadenza si sommano: ogni cliente ha la data più avanzata tra quelle a cui aderisce. Stati, note e solleciti già inseriti restano; annullando la proroga la data torna quella precedente. Controlla sempre il testo del decreto (ambiti e soggetti interessati).</div>
    <div class="toolbar"><div class="field grow"><label>Scadenza</label><select id="prScad">${opz.map((o, i) => `<option value="${i}">${escapeHtml(o.tipo)} — ${fmtData(o.dataOriginale)} (${o.clienti.size} clienti)</option>`).join('')}</select></div>
    <div class="field"><label>Nuova data</label><input type="date" id="prData"></div>
    <div class="field grow"><label>Motivo / riferimento</label><input id="prMotivo" placeholder="es. DL n. …"></div>
    <div class="field"><label>&nbsp;</label><button class="btn primary" data-action="proroga-crea">Applica proroga</button></div></div></div>`;
  const lista = attive.length ? `<div class="card"><div class="section-title">Proroghe attive <span class="cnt">${attive.length}</span></div><table class="compact"><thead><tr><th>Scadenza</th><th>Da</th><th>A</th><th>Aderiscono</th><th>Motivo</th><th></th></tr></thead><tbody>${attive.map(p => { const tot = clientiDiProroga(p).length; const ad = aderentiProroga(p).length; return `<tr><td>${escapeHtml(p.tipo)}</td><td>${fmtData(p.dataOriginale)}</td><td><strong>${fmtData(p.dataNuova)}</strong></td><td><span class="badge ${ad === tot ? 'info' : 'stato-da-fare'}">${ad} di ${tot}</span></td><td>${escapeHtml(p.motivo || '')}</td><td style="white-space:nowrap;"><button class="btn small" data-action="proroga-clienti" data-id="${p.id}">Chi aderisce</button> <button class="btn small danger" data-action="proroga-elimina" data-id="${p.id}">Annulla</button></td></tr>`; }).join('')}</tbody></table></div>` : '';
  return form + lista;
}
/* Scelta dei clienti che aderiscono a una proroga, con la data che ciascuno ha oggi. */
function modalProrogaClienti(id) {
  const p = (STATE.proroghe || []).find(x => x.id === id);
  if (!p) return;
  const { periodiche } = derivati();
  const dataDi = (cid) => { const sc = periodiche.find(x => x.clienteId === cid && x.tipo === p.tipo && (x.dataOriginale || x.data) === p.dataOriginale); return sc ? sc.data : null; };
  const ids = clientiDiProroga(p).sort((a, b) => nomeCliente(a).localeCompare(nomeCliente(b)));
  const righe = ids.map(cid => `<tr data-prc-riga="${escapeHtml(nomeCliente(cid).toLowerCase())}"><td><label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer;"><input type="checkbox" data-action="proroga-conta" data-prc="${cid}" ${(!p.clienteIds || p.clienteIds.includes(cid)) ? 'checked' : ''}> ${escapeHtml(nomeCliente(cid))}</label></td><td class="helptext" style="white-space:nowrap;">oggi: ${dataDi(cid) ? fmtData(dataDi(cid)) : '—'}</td></tr>`).join('');
  h('modalRoot').innerHTML = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:560px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>Chi aderisce alla proroga</h2><div class="modal-sub">${escapeHtml(p.tipo)}: dal ${fmtData(p.dataOriginale)} al <b>${fmtData(p.dataNuova)}</b>${p.motivo ? ' — ' + escapeHtml(p.motivo) : ''}. Togli la spunta ai clienti che NON se ne avvalgono: restano alla data precedente.</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <div class="toolbar" style="margin:10px 0;"><input type="text" id="prcCerca" data-action="proroga-cerca" placeholder="Cerca cliente…" style="flex:1;"><button class="btn small" data-action="proroga-clienti-tutti" data-val="1">Tutti</button><button class="btn small" data-action="proroga-clienti-tutti" data-val="0">Nessuno</button></div>
      <div style="max-height:46vh;overflow:auto;border:1px solid var(--border);border-radius:8px;"><table class="compact"><tbody>${righe || '<tr><td class="helptext">Nessun cliente ha questa scadenza.</td></tr>'}</tbody></table></div>
      <div class="helptext" id="prcConteggio" style="margin-top:8px;"></div>
      <div class="modal-actions">
        <button class="btn" data-action="chiudi-modal">Annulla</button>
        <button class="btn primary" data-action="proroga-clienti-salva" data-id="${p.id}">Salva</button>
      </div>
    </div>
  </div>`;
  prcAggiornaConteggio();
}
function prcAggiornaConteggio() {
  const c = document.querySelectorAll('input[data-prc]');
  const n = Array.from(c).filter(x => x.checked).length;
  const box = h('prcConteggio'); if (box) box.textContent = `${n} di ${c.length} clienti aderiscono.`;
}
const STATI_CPB = ['Dati ISA mancanti', 'Da valutare', 'Calcolato', 'Aderito', 'Non aderito', 'Non applicabile'];
/* Colori come le altre tendine di stato di Prisma (select.statoSel) e come i riquadri KPI. I vecchi stati "Proposta ricevuta"
   e "Valutata" (tolti) si leggono come "Calcolato". */
const CPB_CLASSI = { 'Dati ISA mancanti': { sel: 'stato-dati-isa', kpi: 'inscadenza' }, 'Da valutare': { sel: 'stato-da-fare', kpi: 'inscadenza' }, 'Calcolato': { sel: 'stato-calcolato', kpi: 'completati' }, 'Aderito': { sel: 'stato-inviato-telematicamente', kpi: 'futuri' }, 'Non aderito': { sel: 'stato-errore', kpi: 'scaduti' }, 'Non applicabile': { sel: 'stato-non-applicabile', kpi: 'kpi-grigio' } };
function statoCpbCliente(id) {
  const x = ((STATE.cpb || {})[id] || {}).stato || 'Da valutare';
  return STATI_CPB.includes(x) ? x : ((x === 'Proposta ricevuta' || x === 'Valutata') ? 'Calcolato' : 'Da valutare');
}
/* Chi può aderire al CPB (biennio 2026-2027): solo chi applica gli ISA; i forfettari sono esclusi (fonti: Circ. AdE 8/E, D.Lgs. 148/2026 - il termine va
   verificato ogni anno). Qui si esclude in automatico solo ciò che si sa dall'anagrafica: forfettari = non ammessi (nascosti di default);
   enti non commerciali = da verificare (di norma niente ISA, ma dipende dall'attività). Gli altri requisiti (debiti, dichiarazioni omesse...) restano al professionista. */
let CPB_FILTRO = { tipo: 'Tutti', regime: 'Tutti', stato: 'Tutti', mostraNonAmmessi: false };
/* Associazioni ed enti: NON tutte sono soggette agli ISA, quindi niente esclusione automatica ma segnalazione "da verificare" caso per caso
   (indicazioni da una sintesi IA, da confermare su circolare/istruzioni ISA prima di proporre il CPB):
   - enti non commerciali e ETS: di norma esclusi dagli ISA per l'attivita' istituzionale; esclusioni specifiche (ETS, OdV/APS) legate a condizioni/autorizzazioni;
   - ASD in regime L.398/91: esclusione ISA per i proventi commerciali connessi agli scopi istituzionali, ma l'assoggettamento dipende dal plafond dei proventi;
   - attivita' commerciali ordinarie o separate (bar, ristorazione, altro): possibile ISA per quella gestione. */
const CPB_NOTA_ASSOCIAZIONI = 'Associazione/ente: non tutte sono soggette agli ISA. Enti non commerciali/ETS: di norma esclusi per l\'attivita\' istituzionale (esclusioni specifiche per ETS, OdV/APS: verificare condizioni). ASD in L.398/91: dipende dal plafond dei proventi commerciali. Attivita\' commerciali ordinarie (bar, ristorazione...): possibile ISA per quella parte. Verifica caso per caso prima di proporre il CPB.';
function ammissibilitaCpb(c) {
  if (c.regimeFiscale === 'Forfettario') return { ok: false, nota: 'Forfettario: escluso dal CPB' };
  if (cpbIsaDaVerificare(c)) {
    if (c.soggettoIsa === 'SI') return { ok: true };
    if (c.soggettoIsa === 'NO') return { ok: false, nota: 'Non soggetto a ISA (verificato in anagrafica): escluso dal CPB' };
    return { ok: false, daVerificare: true, nota: CPB_NOTA_ASSOCIAZIONI };
  }
  if (REGIMI_FORFETTARI.includes(c.regimeFiscale)) return { ok: false, nota: 'Forfettario: escluso dal CPB' };
  return { ok: true };
}
/* Avviso (sopra le due viste CPB): clienti da verificare per gli ISA, con link alla scheda; non entrano nelle liste finché non si indica Sì/No in anagrafica. */
function avvisoCpbIsa() {
  const l = STATE.clienti.filter(c => clienteAttivo(c) && ammissibilitaCpb(c).daVerificare);
  if (!l.length) return '';
  return `<div class="card" style="border-left:4px solid var(--giallo);padding:10px 14px;margin-bottom:12px;"><strong>⚠ ${l.length} ${l.length === 1 ? 'cliente da verificare' : 'clienti da verificare'} per gli ISA</strong> prima di poterli valutare per il CPB (non tutte le associazioni e gli enti sono soggetti agli ISA): apri la scheda e indica "Soggetto a ISA" sì/no. ${l.map(c => `<a href="#" data-action="apri-cliente" data-id="${c.id}" style="font-weight:700;">${escapeHtml(c.ragioneSociale)}</a>`).join(' · ')}<div class="helptext" style="margin-top:4px;">${escapeHtml(CPB_NOTA_ASSOCIAZIONI)}</div></div>`;
}
/* -------------------- CPB: valutazione di convenienza (società per società) --------------------
   Si inseriscono i dati della proposta dell'Agenzia (reddito e valore della produzione concordati 2026/2027, voto ISA 2025,
   reddito di riferimento) e la proiezione 2026-2027 dal bilancio provvisorio; Prisma stima le imposte CON e SENZA concordato e
   dà un'indicazione (conviene / al limite / non conviene). È uno strumento di confronto semplificato: NON modella perdite pregresse,
   contributi, addizionali, rischio di decadenza o cessazione, e le aliquote vanno verificate sulla circolare 8/E (si modificano nei parametri).
   La decisione resta del professionista. */
const CPB_PARAMETRI_DEFAULT = { ires: 24, irpef: 35, irap: 3.9, sostAlta: 10, sostMedia: 12, sostBassa: 15, soglia: 85000, tolleranza: 10 };
function cpbParametri() { return Object.assign({}, CPB_PARAMETRI_DEFAULT, (STATE.meta && STATE.meta.cpbParametri) || {}); }
const CPB_CAMPI = [
  { k: 'redConc26', l: 'Reddito concordato 2026' }, { k: 'redConc27', l: 'Reddito concordato 2027' },
  { k: 'vpnConc26', l: 'Valore produzione netta concordato 2026 (IRAP)' }, { k: 'vpnConc27', l: 'Valore produzione netta concordato 2027 (IRAP)' },
  { k: 'redRif', l: 'Reddito di riferimento (dichiarato 2025)' }, { k: 'isa', l: 'Voto ISA 2025' },
  { k: 'redProj26', l: 'Reddito stimato 2026 (bilancio provvisorio)' }, { k: 'redProj27', l: 'Reddito stimato 2027 (vuoto = come 2026)' },
  { k: 'vpnProj26', l: 'Valore produzione stimato 2026 (IRAP)' }, { k: 'vpnProj27', l: 'Valore produzione stimato 2027 (vuoto = come 2026)' },
];
function cpbNum(v) { if (v === '' || v == null) return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; }
function cpbAliquotaOrdinaria(c, P) { return (['societa_capitali', 'cooperativa', 'impresa_sociale'].includes(c.tipo) ? P.ires : P.irpef) / 100; }
function cpbAliquotaSostitutiva(isa, P) { if (isa == null) return P.sostBassa / 100; return (isa >= 8 ? P.sostAlta : (isa >= 6 ? P.sostMedia : P.sostBassa)) / 100; }
/* dati = { redConc26, ..., optSost }. Ritorna imposte con/senza CPB per il biennio e il verdetto. */
function calcolaCpb(c, dati, P) {
  dati = dati || {}; P = P || cpbParametri();
  const n = (k) => cpbNum(dati[k]);
  const rc26 = n('redConc26'), rp26 = n('redProj26');
  if (rc26 == null || rp26 == null) return { completo: false, verdetto: 'Dati incompleti' };
  const rc27 = n('redConc27') != null ? n('redConc27') : rc26;
  const rp27 = n('redProj27') != null ? n('redProj27') : rp26;
  const vc26 = n('vpnConc26') || 0, vc27 = n('vpnConc27') != null ? n('vpnConc27') : vc26;
  const vp26 = n('vpnProj26') != null ? n('vpnProj26') : 0, vp27 = n('vpnProj27') != null ? n('vpnProj27') : vp26;
  const rif = n('redRif') != null ? n('redRif') : null, isa = n('isa');
  const ord = cpbAliquotaOrdinaria(c, P), sost = cpbAliquotaSostitutiva(isa, P), irap = P.irap / 100;
  const optSost = dati.optSost !== false && dati.optSost !== 'false';
  const senza = (red, vpn) => Math.max(0, red) * ord + Math.max(0, vpn) * irap;
  const con = (red, vpn) => {
    const quota = rif != null ? Math.max(0, red - Math.max(0, rif)) : 0; // parte del reddito concordato oltre il riferimento
    const agev = (optSost && rif != null) ? Math.min(quota, P.soglia) : 0;
    return Math.max(0, red - agev) * ord + agev * sost + Math.max(0, vpn) * irap;
  };
  const senza26 = senza(rp26, vp26), senza27 = senza(rp27, vp27), con26 = con(rc26, vc26), con27 = con(rc27, vc27);
  const totSenza = senza26 + senza27, totCon = con26 + con27, delta = totCon - totSenza;
  let verdetto = 'Conviene';
  const tol = totSenza * (P.tolleranza / 100);
  if (delta > 0) verdetto = (totSenza > 0 && delta <= tol) ? 'Al limite' : 'Non conviene';
  else if (-delta <= tol) verdetto = 'Al limite'; // risparmio marginale
  const scostamento = rc26 !== 0 ? (rp26 - rc26) / Math.abs(rc26) : null;
  return { completo: true, senza26, senza27, con26, con27, totSenza, totCon, delta, verdetto, scostamento, avviso: rp26 < rc26 ? 'La proiezione 2026 è sotto il reddito concordato: con il CPB si pagano imposte su un reddito più alto di quello stimato.' : '' };
}
const CPB_VERDETTO_CLASSE = { 'Conviene': 'stato-inviato-telematicamente', 'Al limite': 'stato-da-fare', 'Non conviene': 'stato-errore', 'Dati incompleti': 'stato-non-applicabile' };
function cpbVerdettoBadge(r) { return `<span class="badge ${CPB_VERDETTO_CLASSE[r.verdetto]}">${r.verdetto}</span>`; }

function renderCpb() {
  const f = CPB_FILTRO, P = cpbParametri(), st = statoCpbCliente;
  const tutti = STATE.clienti.filter(c => clienteAttivo(c)).sort((a, b) => a.ragioneSociale.localeCompare(b.ragioneSociale));
  const nNonAmmessi = tutti.filter(c => !ammissibilitaCpb(c).ok && !ammissibilitaCpb(c).daVerificare).length;
  let attivi = tutti.filter(c => ammissibilitaCpb(c).ok || (f.mostraNonAmmessi && !ammissibilitaCpb(c).daVerificare));
  if (f.tipo !== 'Tutti') attivi = attivi.filter(c => c.tipo === f.tipo);
  if (f.regime !== 'Tutti') attivi = attivi.filter(c => c.regimeFiscale === f.regime);
  const conta = (x) => attivi.filter(c => st(c.id) === x).length;
  const kpi = `<div class="kpi-grid" style="grid-template-columns:repeat(${STATI_CPB.length},1fr);">${STATI_CPB.map(x => `<div class="kpi ${CPB_CLASSI[x].kpi}"><div class="n">${conta(x)}</div><div class="l">${x.toUpperCase()}</div></div>`).join('')}</div>`;
  const lista = f.stato === 'Tutti' ? attivi : attivi.filter(c => st(c.id) === f.stato);
  const toolbar = `<div class="toolbar">
    <div class="field"><label>Tipo di cliente</label><select data-action="cpb-filtro-tipo"><option value="Tutti">Tutti</option>${TIPI_CLIENTE.map(t => `<option value="${t.v}" ${f.tipo === t.v ? 'selected' : ''}>${escapeHtml(t.l)}</option>`).join('')}</select></div>
    <div class="field"><label>Regime fiscale</label><select data-action="cpb-filtro-regime"><option value="Tutti">Tutti</option>${REGIMI_FISCALI.map(r => `<option ${f.regime === r ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('')}</select></div>
    <div class="field"><label>Stato</label><select data-action="cpb-filtro-stato"><option>Tutti</option>${STATI_CPB.map(x => `<option ${f.stato === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    <div class="field" style="min-width:max-content;"><label>&nbsp;</label><label class="checkline" style="white-space:nowrap;"><input type="checkbox" data-action="cpb-filtro-non-ammessi" ${f.mostraNonAmmessi ? 'checked' : ''}> Mostra anche i non ammessi (${nNonAmmessi})</label></div>
    <div class="field" style="margin-left:auto;"><label>&nbsp;</label><button class="btn small" data-action="cpb-val-esporta">⬇ Esporta riepilogo (CSV)</button></div>
  </div>`;
  const num = (v) => { const n = cpbNum(v); return n == null ? '' : fmtEuro(n); };
  const tr = lista.map(c => {
    const amm = ammissibilitaCpb(c), e = (STATE.cpb || {})[c.id] || {}, d = e.dati || {};
    const r = amm.ok ? calcolaCpb(c, d, P) : { completo: false, verdetto: 'Non ammesso' };
    const badge = !amm.ok ? ` <span class="badge" style="background:var(--grigio-bg);color:var(--grigio);">Non ammesso</span>` : '';
    const cifre = r.completo
      ? `<td style="text-align:right;">${num(d.redConc26)}</td><td style="text-align:right;">${num(d.redProj26)}</td><td style="text-align:right;">${fmtEuro(r.totSenza)}</td><td style="text-align:right;">${fmtEuro(r.totCon)}</td><td style="text-align:right;font-weight:700;color:${r.delta <= 0 ? 'var(--verde)' : 'var(--rosso)'};">${r.delta <= 0 ? '−' : '+'}${fmtEuro(Math.abs(r.delta))}</td><td>${cpbVerdettoBadge(r)}</td>`
      : `<td colspan="6" class="helptext">${amm.ok ? 'Dati della proposta e proiezione da inserire' : escapeHtml(amm.nota || '')}</td>`;
    return `<tr${amm.ok ? '' : ' style="opacity:.55;"'}><td><strong>${escapeHtml(c.ragioneSociale)}</strong>${badge}<div class="helptext">${escapeHtml(labelTipoCliente(c.tipo))} · ${escapeHtml(c.regimeFiscale || '—')}</div></td>
      <td><select class="statoSel ${CPB_CLASSI[st(c.id)].sel}" data-action="cpb-stato" data-id="${c.id}" ${amm.ok ? '' : 'disabled'}>${STATI_CPB.map(x => `<option ${st(c.id) === x ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
      ${cifre}
      <td style="max-width:220px;"><div data-action="cpb-nota-apri" data-id="${c.id}" title="${escapeHtml(e.nota || 'Aggiungi una nota')}" style="cursor:pointer;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px;${e.nota ? '' : 'color:var(--text-mut);'}">${e.nota ? '📝 ' + escapeHtml(String(e.nota).split('\n')[0]) : '+ Nota'}</div></td>
      <td>${amm.ok ? `<button class="btn small" data-action="cpb-valuta" data-id="${c.id}">Valuta</button>` : ''}</td></tr>`;
  }).join('');
  const tabella = lista.length ? `<div class="card" style="overflow-x:auto;"><table class="compact"><thead><tr><th>Cliente</th><th>Stato</th><th style="text-align:right;">Concordato 2026</th><th style="text-align:right;">Stimato 2026</th><th style="text-align:right;">Imposte senza CPB (2026+27)</th><th style="text-align:right;">Imposte con CPB (2026+27)</th><th style="text-align:right;">Differenza</th><th>Indicazione</th><th>Nota</th><th></th></tr></thead><tbody>${tr}</tbody></table></div>` : `<div class="card"><div class="empty">Nessun cliente corrisponde ai filtri.</div></div>`;
  return avvisoCpbIsa() + `<div class="helptext" style="margin-bottom:8px;">Concordato preventivo biennale 2026-2027: possono aderire solo i contribuenti che applicano gli ISA (i <strong>forfettari sono esclusi</strong>), senza debiti tributari/contributivi definitivi oltre 5.000 € e senza dichiarazioni omesse negli ultimi tre anni. Per ogni società: stato dell'adesione e confronto tra le imposte stimate <strong>con</strong> e <strong>senza</strong> concordato (clicca "Valuta" per inserire la proposta dell'Agenzia e la proiezione dal bilancio provvisorio). Termine di adesione: 2/11/2026 (da verificare).<br><strong>Documenti per ogni società:</strong> proposta di concordato · bilancio 2025 (4 sezioni) · bilancio provvisorio 2026 alla data odierna (4 sezioni) · dichiarazione 2024 e bozza 2025 · <strong>dati ISA precompilati</strong> (stato "Dati ISA mancanti" finché non importati). La decisione resta al professionista.</div>` + kpi + toolbar + tabella + cpbParametriHtml();
}

function cpbParametriHtml() {
  const P = cpbParametri();
  return `<details class="card" style="margin-top:12px;"><summary style="cursor:pointer;font-weight:700;">Parametri di calcolo (da verificare sulla circolare 8/E)</summary>
    <div class="toolbar" style="margin-top:10px;">
      ${[['ires', 'IRES %'], ['irpef', 'IRPEF marginale % (società di persone, ditte, professionisti)'], ['irap', 'IRAP %'], ['sostAlta', 'Imposta sostitutiva % ISA ≥ 8'], ['sostMedia', 'Imposta sostitutiva % ISA 6–8'], ['sostBassa', 'Imposta sostitutiva % ISA < 6'], ['soglia', 'Limite quota agevolata (€)'], ['tolleranza', '"Al limite" se la differenza (in più o in meno) è ≤ % delle imposte senza CPB']].map(([k, l]) => `<div class="field"><label>${l}</label><input type="number" step="any" value="${P[k]}" data-action="cpb-param" data-k="${k}"></div>`).join('')}
    </div>
    <div class="helptext">Calcolo semplificato: imposte = reddito × aliquota ordinaria + valore della produzione × IRAP; con il CPB si usa il reddito concordato e, se spuntata l'opzione, l'imposta sostitutiva sulla sola parte oltre il reddito di riferimento (fino al limite indicato). Non considera perdite pregresse, contributi, addizionali, decadenza o cessazione. L'indicazione non sostituisce la valutazione del professionista.</div></details>`;
}
/* Nota CPB: finestra a parte con casella grande (in tabella resta solo un'anteprima di una riga). */
function modalNotaCpb(id) {
  const c = clienteById(id); if (!c) return;
  const e = (STATE.cpb || {})[id] || {};
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop"><div class="modal" style="max-width:680px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;"><div><h2>Note CPB</h2><div class="modal-sub">${escapeHtml(c.ragioneSociale)}</div></div><button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button></div>
    <div class="field" style="margin-top:10px;"><textarea id="cpbNotaTesto" rows="14" style="width:100%;border:1px solid var(--border);border-radius:6px;padding:10px 12px;font-family:inherit;font-size:13.5px;line-height:1.5;resize:vertical;">${escapeHtml(e.nota || '')}</textarea></div>
    <div class="modal-actions"><button class="btn" data-action="chiudi-modal">Annulla</button><button class="btn primary" data-action="cpb-nota-salva" data-id="${id}">Salva</button></div></div></div>`;
  const t = document.getElementById('cpbNotaTesto'); if (t) t.focus();
}
function modalValutazioneCpb(id) {
  const c = clienteById(id); if (!c) return;
  const d = ((STATE.cpb || {})[id] || {}).dati || {};
  const campo = (x) => `<div class="field"><label>${escapeHtml(x.l)}</label><input type="number" step="any" id="cpbv_${x.k}" value="${d[x.k] != null && d[x.k] !== '' ? d[x.k] : ''}" data-action="cpb-val-input"></div>`;
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop"><div class="modal" style="max-width:760px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;"><div><h2>Valutazione CPB: ${escapeHtml(c.ragioneSociale)}</h2><div class="helptext">${escapeHtml(labelTipoCliente(c.tipo))} · ${escapeHtml(c.regimeFiscale || '—')}</div></div><button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button></div>
    <div style="font-size:12px;font-weight:700;color:var(--text-mut);text-transform:uppercase;margin:12px 0 4px;">Proposta dell'Agenzia</div>
    <div class="form-grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">${CPB_CAMPI.slice(0, 6).map(campo).join('')}</div>
    <div style="font-size:12px;font-weight:700;color:var(--text-mut);text-transform:uppercase;margin:14px 0 4px;">Proiezione dal bilancio provvisorio</div>
    <div class="form-grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">${CPB_CAMPI.slice(6).map(campo).join('')}</div>
    <label class="checkline" style="margin-top:10px;"><input type="checkbox" id="cpbv_optSost" data-action="cpb-val-input" ${d.optSost === false ? '' : 'checked'}> Opta per l'imposta sostitutiva sulla parte di reddito concordato oltre il riferimento</label>
    <div id="cpbvRisultato" style="margin-top:12px;"></div>
    <div class="field" style="margin-top:10px;"><label>Note di valutazione (Federico / Matteo)</label><textarea id="cpbv_nota" rows="8" style="width:100%;font-size:13px;line-height:1.5;">${escapeHtml(((STATE.cpb || {})[id] || {}).nota || '')}</textarea></div>
    <div class="modal-actions" style="flex-wrap:wrap;">
      <button class="btn" data-action="chiudi-modal">Chiudi</button>
      <button class="btn primary" data-action="cpb-val-salva" data-id="${id}">Salva</button>
      <button class="btn" data-action="cpb-val-decisione" data-id="${id}" data-stato="Aderito" style="background:var(--verde-bg);color:var(--verde);">Salva e segna "Aderito"</button>
      <button class="btn" data-action="cpb-val-decisione" data-id="${id}" data-stato="Non aderito" style="background:var(--rosso-bg);color:var(--rosso);">Salva e segna "Non aderito"</button>
    </div></div></div>`;
  document.getElementById('modalRoot').innerHTML = html;
  ricalcolaModalCpb(id);
}
function leggiDatiModalCpb() {
  const d = {};
  CPB_CAMPI.forEach(x => { const el = document.getElementById('cpbv_' + x.k); d[x.k] = el && el.value !== '' ? Number(el.value) : ''; });
  const o = document.getElementById('cpbv_optSost'); d.optSost = o ? o.checked : true;
  return d;
}
function ricalcolaModalCpb(id) {
  const c = clienteById(id || (document.querySelector('[data-action="cpb-val-salva"]') || {}).dataset?.id); const box = document.getElementById('cpbvRisultato');
  if (!c || !box) return;
  const r = calcolaCpb(c, leggiDatiModalCpb(), cpbParametri());
  if (!r.completo) { box.innerHTML = `<div class="helptext" style="padding:10px;background:var(--bg);border-radius:8px;">Inserisci almeno il reddito concordato 2026 e il reddito stimato 2026 per vedere il confronto.</div>`; return; }
  box.innerHTML = `<div style="padding:12px;background:var(--bg);border-radius:8px;">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;"><strong>Indicazione:</strong> ${cpbVerdettoBadge(r)}</div>
    <table class="compact" style="margin-top:8px;"><thead><tr><th></th><th style="text-align:right;">2026</th><th style="text-align:right;">2027</th><th style="text-align:right;">Totale</th></tr></thead><tbody>
      <tr><td>Imposte stimate senza CPB</td><td style="text-align:right;">${fmtEuro(r.senza26)}</td><td style="text-align:right;">${fmtEuro(r.senza27)}</td><td style="text-align:right;">${fmtEuro(r.totSenza)}</td></tr>
      <tr><td>Imposte con CPB</td><td style="text-align:right;">${fmtEuro(r.con26)}</td><td style="text-align:right;">${fmtEuro(r.con27)}</td><td style="text-align:right;">${fmtEuro(r.totCon)}</td></tr>
      <tr><td><strong>Differenza (− = risparmio)</strong></td><td></td><td></td><td style="text-align:right;font-weight:700;color:${r.delta <= 0 ? 'var(--verde)' : 'var(--rosso)'};">${r.delta <= 0 ? '−' : '+'}${fmtEuro(Math.abs(r.delta))}</td></tr></tbody></table>
    <div class="helptext" style="margin-top:6px;">Scostamento stimato 2026 rispetto al concordato: ${r.scostamento == null ? '—' : (r.scostamento * 100).toFixed(1) + '%'}${r.avviso ? '<br>⚠️ ' + escapeHtml(r.avviso) : ''}</div></div>`;
}
function salvaValutazioneCpb(id, nuovoStato) {
  if (!STATE.cpb) STATE.cpb = {};
  const cur = STATE.cpb[id] || {};
  const nota = (document.getElementById('cpbv_nota') || {}).value;
  STATE.cpb[id] = Object.assign({}, cur, { dati: leggiDatiModalCpb(), nota: nota != null ? nota : cur.nota }, nuovoStato ? { stato: nuovoStato } : {});
  salvaStato();
}
function cpbCsvRiepilogo() {
  const P = cpbParametri();
  const esc = (v) => { v = String(v == null ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const righe = [['Cliente', 'Tipo', 'Regime', 'Concordato 2026', 'Stimato 2026', 'Scostamento %', 'Imposte senza CPB', 'Imposte con CPB', 'Differenza', 'Indicazione', 'Stato', 'Note'].join(';')];
  STATE.clienti.filter(c => clienteAttivo(c) && ammissibilitaCpb(c).ok).sort((a, b) => a.ragioneSociale.localeCompare(b.ragioneSociale)).forEach(c => {
    const e = (STATE.cpb || {})[c.id] || {}, r = calcolaCpb(c, e.dati, P), d = e.dati || {};
    righe.push([c.ragioneSociale, labelTipoCliente(c.tipo), c.regimeFiscale || '', r.completo ? d.redConc26 : '', r.completo ? d.redProj26 : '', r.completo && r.scostamento != null ? (r.scostamento * 100).toFixed(1) : '', r.completo ? r.totSenza.toFixed(0) : '', r.completo ? r.totCon.toFixed(0) : '', r.completo ? r.delta.toFixed(0) : '', r.verdetto, statoCpbCliente(c.id), e.nota || ''].map(esc).join(';'));
  });
  return '\ufeff' + righe.join('\r\n');
}

/* -------------------- REPORT MENSILE AL CLIENTE --------------------
   "Cosa abbiamo fatto e cosa scade": generato dai dati già presenti (nessun inserimento), mostrato in anteprima
   modificabile e salvato come BOZZA di comunicazione nel portale — non parte mai da solo. */
function reportMensileCliente(clienteId, mese) {
  const c = clienteById(clienteId);
  if (!c) return '';
  const [a, m] = mese.split('-').map(Number);
  const nomeMese = new Date(a, m - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const { tutteScadenze, annuali } = derivati();
  const inMese = (iso) => !!iso && iso.slice(0, 7) === mese;
  const fatte = tutteScadenze.filter(x => x.clienteId === clienteId && STATI_SCADENZA_CHIUSI.includes(x.stato) && inMese(x.dataCompletamento));
  const fasiFatte = [];
  annuali.filter(x => x.clienteId === clienteId).forEach(x => x.sotto.forEach(sf => { if (sf.completato && inMese(sf.data)) fasiFatte.push(`${x.tipoNome}: ${sf.nome}`); }));
  const docs = (STATE.documenti || []).filter(d => d.clienteId === clienteId && inMese(d.dataCaricamento));
  const f24 = (STATE.f24 || []).filter(x => x.clienteId === clienteId && inMese(x.data));
  const oggi = oggiISO();
  const prossime = tutteScadenze.filter(x => x.clienteId === clienteId && !STATI_SCADENZA_CHIUSI.includes(x.stato) && x.data >= oggi && giorniTra(oggi, x.data) <= 45).sort((x, y) => x.data.localeCompare(y.data));
  const annProssimi = annuali.filter(x => x.clienteId === clienteId && !x.completato && x.scadenza && x.scadenza >= oggi && giorniTra(oggi, x.scadenza) <= 45);
  const lista = (arr, fmt) => arr.length ? arr.map(x => '- ' + fmt(x)).join('\n') : '- nessuna attività in questo periodo';
  const righeProssime = prossime.map(x => `${fmtData(x.data)} — ${x.nome}`).concat(annProssimi.map(x => `${fmtData(x.scadenza)} — ${x.tipoNome}`));
  return `Gentile ${c.ragioneSociale},\n\necco il riepilogo delle attività dello studio per ${nomeMese}.\n\nCosa abbiamo fatto\n${lista(fatte.map(x => x.nome).concat(fasiFatte), x => x)}\n${docs.length ? '\nDocumenti archiviati: ' + docs.map(d => d.nome).join(', ') + '.' : ''}${f24.length ? '\nF24 predisposti: ' + f24.length + '.' : ''}\n\nCosa scade nei prossimi 45 giorni\n${lista(righeProssime, x => x)}\n\nPer qualsiasi dubbio siamo a disposizione.\nCordiali saluti`;
}
function modalReportMensile(clienteId, mese) {
  const c = clienteById(clienteId);
  if (!c) return;
  mese = mese || oggiISO().slice(0, 7);
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop"><div class="modal" style="max-width:640px;">
    <div style="display:flex;justify-content:space-between;"><div><h2>Report mensile</h2><div class="modal-sub">${escapeHtml(c.ragioneSociale)}</div></div><button class="icon-x" data-action="chiudi-modal">✕</button></div>
    <div class="field" style="max-width:200px;"><label>Mese</label><input type="month" id="rmMese" value="${mese}" data-action="report-mensile-mese" data-cliente="${c.id}"></div>
    <div class="field full"><label>Testo (modificabile)</label><textarea id="rmTesto" rows="16" style="width:100%;">${escapeHtml(reportMensileCliente(clienteId, mese))}</textarea></div>
    <div class="helptext">Viene salvato come bozza di comunicazione: lo invii tu dal portale quando vuoi.</div>
    <div class="modal-actions"><button class="btn" data-action="chiudi-modal">Annulla</button><button class="btn primary" data-action="report-mensile-salva" data-cliente="${c.id}">Crea bozza comunicazione</button></div></div></div>`;
}

