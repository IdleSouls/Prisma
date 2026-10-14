'use strict';
/* -------------------- RENDER: SCADENZE PERIODICHE -------------------- */
let SCAD_FILTRO = { bucket: 'Tutti', stato: 'Tutti', resp: 'Tutti', tipo: 'Tutti', q: '', dataDa: '', dataA: '' };

/* Selezione multipla per le azioni bulk sulla vista Scadenze (vedi scadBulkBar sotto). Un Set di
   id sopravvive volutamente a cambi di filtro/pagina all'interno della stessa visita alla vista —
   "seleziona 15 clienti in ritardo sulla stessa scadenza" spesso richiede scorrere più pagine
   prima di applicare l'azione una volta sola su tutte. Si svuota dopo ogni applicazione bulk. */
let SCAD_SELEZIONATE = new Set();

/* Storico solleciti e Step di controllo (modalSolleciti/modalControlloImposta) sono richiamabili
   sia da un punto qualunque con la scadenza già in tabella (riga di Scadenze periodiche), sia da
   dentro modalDettaglioScadenza (task #110) come approfondimento. Nel secondo caso, prima non c'era
   modo di tornare al dettaglio: "Chiudi" chiudeva tutto il modale, non solo l'approfondimento. Questo
   flag (vero UI, non salvato) ricorda se il sotto-modale attualmente aperto è stato raggiunto dal
   dettaglio — se sì, ci si aggiunge un pulsante "← Indietro"; se aperto direttamente dalla tabella,
   resta come prima (solo Chiudi). Si azzera ad ogni apertura "diretta" e si rialza solo dalle azioni
   dedicate scad-detail-apri-solleciti/scad-detail-apri-controllo. */
let SCAD_SUBMODAL_DA_DETTAGLIO = false;

/* Stessa logica di filtro/ordinamento usata dal render, isolata qui perché serve anche
   all'azione "seleziona tutte le N filtrate" (che deve operare sull'intera lista filtrata,
   non solo sulla pagina visibile). */
/* Voci del filtro "Avanzamento": gli stati generici più tutte le fasi realmente usate dalle scadenze. */
function opzioniFiltroAvanzamento(lista) {
  const fasi = [];
  (lista || []).forEach(s => (s.fasi || []).forEach(f => { if (!fasi.includes(f)) fasi.push(f); }));
  return ['Da fare'].concat(fasi, ['Errore', STATO_NON_PUO_PAGARE, 'Non applicabile']);
}
function scadenzeFiltrate() {
  const { periodiche } = derivati();
  const { scaduti, inScadenza, futuri, completati } = classificaScadenze(periodiche, oggiISO());
  const buckets = { Tutti: periodiche, Scaduti: scaduti, 'In scadenza': inScadenza, Futuri: futuri, Completati: completati };
  let lista = buckets[SCAD_FILTRO.bucket] || periodiche;
  if (SCAD_FILTRO.stato !== 'Tutti') lista = lista.filter(s => s.stato === SCAD_FILTRO.stato || s.fase === SCAD_FILTRO.stato);
  if (SCAD_FILTRO.resp !== 'Tutti') lista = lista.filter(s => s.responsabile === SCAD_FILTRO.resp);
  if (SCAD_FILTRO.tipo !== 'Tutti') lista = lista.filter(s => s.tipo === SCAD_FILTRO.tipo);
  if (SCAD_FILTRO.q) lista = lista.filter(s => nomeCliente(s.clienteId).toLowerCase().includes(SCAD_FILTRO.q.toLowerCase()));
  if (SCAD_FILTRO.dataDa) lista = lista.filter(s => s.data >= SCAD_FILTRO.dataDa);
  if (SCAD_FILTRO.dataA) lista = lista.filter(s => s.data <= SCAD_FILTRO.dataA);
  return lista.slice().sort((a,b) => a.data.localeCompare(b.data) || nomeCliente(a.clienteId).localeCompare(nomeCliente(b.clienteId)));
}

function renderScadenze() {
  if (VIEW_PARAMS.filtro) {
    const map = { scaduti: 'Scaduti', inscadenza: 'In scadenza', futuri: 'Futuri', completati: 'Completati' };
    SCAD_FILTRO.bucket = map[VIEW_PARAMS.filtro] || 'Tutti';
    VIEW_PARAMS = {};
  }
  const { periodiche } = derivati();
  const { scaduti, inScadenza, futuri, completati } = classificaScadenze(periodiche, oggiISO());
  const buckets = { Tutti: periodiche, Scaduti: scaduti, 'In scadenza': inScadenza, Futuri: futuri, Completati: completati };

  // readiness: quante scadenze "in scadenza" (prossimi 30gg, non chiuse) hanno già l'importo
  // impostato — utile per capire se sei pronto prima che arrivi la data, come in Scadero.
  const inScadenzaConImp = inScadenza.filter(s => s.conImporto);
  const conImporto = inScadenzaConImp.filter(s => s.importo !== null && s.importo !== undefined).length;
  const readinessPct = inScadenzaConImp.length ? Math.round((conImporto / inScadenzaConImp.length) * 100) : 100;
  const readiness = inScadenzaConImp.length ? `<div class="card" style="padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;gap:10px;">
    <span class="badge ${readinessPct===100?'stato-inviato-telematicamente':readinessPct>=50?'stato-da-fare':'stato-errore'}">${readinessPct}%</span>
    <span class="helptext">Pronte per l'invio: <b>${conImporto}/${inScadenzaConImp.length}</b> scadenze in arrivo (prossimi 30gg) hanno già l'importo impostato (non conto quelle senza importo).</span>
  </div>` : '';

  const tipiValori = Array.from(new Set(periodiche.map(s => s.tipo))).sort();
  const tipiGruppi = raggruppaTipiPerCategoria(tipiValori);
  const lista = scadenzeFiltrate();

  const toolbar = `<div class="toolbar">
    <div class="field"><label>Bucket</label><select data-action="scad-filtro-bucket">
      ${Object.keys(buckets).map(b=>`<option value="${b}" ${SCAD_FILTRO.bucket===b?'selected':''}>${b} (${buckets[b].length})</option>`).join('')}
    </select></div>
    <div class="field"><label>Avanzamento</label><select data-action="scad-filtro-stato">
      <option ${SCAD_FILTRO.stato==='Tutti'?'selected':''}>Tutti</option>
      ${opzioniFiltroAvanzamento(periodiche).map(s=>`<option ${SCAD_FILTRO.stato===s?'selected':''}>${escapeHtml(s)}</option>`).join('')}
    </select></div>
    <div class="field"><label>Responsabile</label><select data-action="scad-filtro-resp">
      <option ${SCAD_FILTRO.resp==='Tutti'?'selected':''}>Tutti</option>
      ${STATE.meta.responsabili.map(r=>`<option ${SCAD_FILTRO.resp===r?'selected':''}>${escapeHtml(r)}</option>`).join('')}
    </select></div>
    <div class="field"><label>Tipo</label><select data-action="scad-filtro-tipo">
      <option ${SCAD_FILTRO.tipo==='Tutti'?'selected':''}>Tutti</option>
      ${tipiGruppi.map(([cat, vals])=>`<optgroup label="${escapeHtml(cat)}">
        ${vals.map(t=>`<option ${SCAD_FILTRO.tipo===t?'selected':''}>${escapeHtml(t)}</option>`).join('')}
      </optgroup>`).join('')}
    </select></div>
    <div class="field grow"><label>Cerca cliente</label><input type="text" value="${escapeHtml(SCAD_FILTRO.q)}" data-action="scad-filtro-q" placeholder="Nome cliente..."></div>
    <div class="field"><label>Scadenza da</label>${campoDataTesto('scad-filtro-data-da', SCAD_FILTRO.dataDa)}</div>
    <div class="field"><label>Scadenza a</label>${campoDataTesto('scad-filtro-data-a', SCAD_FILTRO.dataA)}</div>
    <div class="field"><label>&nbsp;</label><button class="btn small" data-action="scad-seleziona-tutti-filtrati">☑ Seleziona tutte (${lista.length})</button></div>
  </div>`;

  if (periodiche.length === 0) {
    return readiness + toolbar + `<div class="card"><div class="empty"><div class="big">Nessuna scadenza generata</div>Aggiungi clienti con almeno un flag fiscale attivo (es. periodicità IVA) per veder comparire qui le scadenze.</div></div>`;
  }
  if (lista.length === 0) {
    return readiness + toolbar + `<div class="card"><div class="empty">Nessuna scadenza corrisponde ai filtri.</div></div>`;
  }

  // Barra azioni bulk: applica in un colpo solo lo stesso cambio di stato/responsabile/step di
  // controllo, o un identico sollecito, a tutte le scadenze selezionate — invece di dover ripetere
  // la stessa operazione riga per riga (fix da audit "occhi da commercialista" su 150 clienti).
  const bulkBar = SCAD_SELEZIONATE.size > 0 ? `<div id="scadBulkBar" class="card" style="padding:10px 14px;margin-bottom:12px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;background:var(--blu-light);">
    <b>${SCAD_SELEZIONATE.size} selezionate</b>
    <button class="btn small" data-action="scad-bulk-deseleziona">Deseleziona tutte</button>
    <span style="width:1px;height:20px;background:var(--border);"></span>
    <select id="scadBulkStato"><option value="">Cambia avanzamento in...</option>${opzioniFiltroAvanzamento(periodiche.filter(x => SCAD_SELEZIONATE.has(x.id))).map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}</select>
    <button class="btn small" data-action="scad-bulk-stato">Applica</button>
    <select id="scadBulkResp"><option value="">Assegna responsabile...</option>${STATE.meta.responsabili.map(r=>`<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('')}</select>
    <button class="btn small" data-action="scad-bulk-resp">Applica</button>
    <button class="btn small primary" data-action="scad-bulk-sollecito">🔔 Registra sollecito a tutte</button>
  </div>` : '';

  const pag = paginaLista('scadenze', lista);
  const tutteSelezionateInPagina = pag.pagina.length > 0 && pag.pagina.every(s => SCAD_SELEZIONATE.has(s.id));
  const righe = pag.pagina.map(s => {
    const d = deltaLabel(s.data);
    const chiuso = STATI_SCADENZA_CHIUSI.includes(s.stato);
    const nSolleciti = (s.solleciti || []).length;
    return `<tr class="${SCAD_SELEZIONATE.has(s.id)?'riga-selezionata':''}">
      <td><input type="checkbox" data-action="scad-toggle-sel" data-id="${s.id}" ${SCAD_SELEZIONATE.has(s.id)?'checked':''}></td>
      <td style="white-space:nowrap;">${fmtData(s.data)}</td>
      <td style="min-width:210px;max-width:280px;" title="Apri la scheda di ${escapeHtml(nomeCliente(s.clienteId))}"><a class="link-cliente" data-action="apri-cliente" data-id="${s.clienteId}" style="color:inherit;text-decoration:none;border-bottom:1px dotted var(--text-mut);cursor:pointer;">${escapeHtml(nomeCliente(s.clienteId))}</a></td>
      <td>${escapeHtml(s.nome)}</td>
      <td>${chiuso?'<span class="helptext">chiusa</span>':`<span class="pill-delta ${d.cls}">${d.txt}</span>`}</td>
      <td><select class="statoSel ${statoBadgeClass(s.stato)}" data-action="scad-cambia-stato" data-id="${s.id}">
        ${opzioniAvanzamento(s).map(st=>`<option ${etichettaStatoScadenza(s)===st?'selected':''}>${escapeHtml(st)}</option>`).join('')}
      </select></td>
      <td><select data-action="scad-cambia-resp" data-id="${s.id}">
        <option value="">—</option>
        ${STATE.meta.responsabili.map(r=>`<option ${s.responsabile===r?'selected':''}>${escapeHtml(r)}</option>`).join('')}
      </select></td>
      <td style="white-space:nowrap;min-width:150px;">${s.conImporto ? `<span class="importo-wrap"><input type="text" inputmode="decimal" class="importo-input" value="${s.importo!=null?escapeHtml(formatImportoIT(s.importo)):''}" data-action="scad-cambia-importo" onkeydown="if(event.key==='Enter'){event.preventDefault();var b=this.parentElement.querySelector('button.importo-ok');if(b)b.click();}" data-id="${s.id}" placeholder="€ 0,00" style="width:105px;text-align:right;border:1px solid var(--border);border-radius:5px;padding:4px 6px;font-size:12px;"> <button class="btn small importo-ok ${s.importo!=null?'salvato':''}" data-action="scad-conferma-importo" data-id="${s.id}" title="Conferma importo">✓</button></span>` : '<span class="helptext">—</span>'}</td>
      <td style="white-space:nowrap;">${badgeAddebitoF24(s.clienteId)}</td>
      <td style="white-space:nowrap;"><button class="btn small" data-action="scad-apri-solleciti" data-id="${s.id}" title="Storico solleciti">🔔 ${nSolleciti||''}</button></td>
      <td style="white-space:nowrap;"><button class="btn small" data-action="scad-apri-controllo" data-id="${s.id}" title="${escapeHtml(s.nota ? 'Nota: ' + s.nota : 'Annotazioni datate')}">📝 ${(s.annotazioni||[]).length||''}${s.nota ? ' •' : ''}</button></td>
      <td style="white-space:nowrap;">${s.dataCompletamento?fmtData(s.dataCompletamento):'—'}</td>
    </tr>`;
  }).join('');

  return readiness + toolbar + bulkBar + `<div class="card" style="padding:0;overflow-x:auto;">
    <table class="compact"><thead><tr><th><input type="checkbox" data-action="scad-toggle-sel-pagina" ${tutteSelezionateInPagina?'checked':''} title="Seleziona/deseleziona tutte le righe di questa pagina"></th><th>Data</th><th>Cliente</th><th>Adempimento</th><th>Countdown</th><th>Avanzamento</th><th>Resp.</th><th>Importo</th><th title="Chi addebita l'F24: dato preso dall'anagrafica del cliente">Addebito F24</th><th>Solleciti</th><th>Annotazioni</th><th>Completata il</th></tr></thead>
    <tbody>${righe}</tbody></table>
  </div>` + controlliPaginazione(pag);
}

/* -------------------- RENDER: RITENUTE D'ACCONTO -------------------- */
let RIT_FILTRO_CLIENTE = 'Tutti';

/* -------------------- QUADRATURA 770 (semaforo) --------------------
   Per cliente e anno d'imposta: confronta le ritenute operate (righe in Ritenute con data di
   pagamento nell'anno) con quelle effettivamente versate.
   - ROSSO: ci sono ritenute dovute non ancora pagate (stato Da pagare / Non pagata).
   - VERDE: tutte pagate.
   - "!" (punto esclamativo): eccedenza, cioè F24 con codice tributo ritenute versati per più del
     dovuto (es. una ritenuta pagata due volte per errore). Rosso! = non tutte pagate ed eccedenza;
     verde! = tutte pagate ed eccedenza.
   - GIALLO (proposta): tutte segnate pagate, ma gli F24 registrati con quel codice versano MENO del
     dovuto: la quadratura non è confermata dagli F24 (manca un F24 o un importo).
   Gli F24 si considerano solo se registrati in Prisma: senza nessun F24 col codice tributo il
   confronto con gli F24 non viene fatto (resta lo stato delle righe). Un versamento si attribuisce
   all'anno X se l'F24 è datato dal 20/01/X al 20/01/X+1 (la ritenuta di dicembre si versa a gennaio).
   Codici tributo considerati: 1040 (ritenute su redditi di lavoro autonomo), modificabile qui. */
const CODICI_TRIBUTO_RITENUTE = ['1040'];
function quadratura770(clienteId, annoImposta) {
  const anno = Number(annoImposta);
  const righe = (STATE.ritenuteRighe || []).filter(r => r.clienteId === clienteId && r.dataPagamento && Number(String(r.dataPagamento).slice(0, 4)) === anno);
  const dal = `${anno}-01-20`, al = `${anno + 1}-01-20`;
  const f24 = (STATE.f24 || []).filter(f => f.clienteId === clienteId && f.tipo !== 'Credito' && f.data && f.data > dal && f.data <= al);
  let versatoF24 = 0, nF24 = 0;
  f24.forEach(f => {
    const rr = righeF24(f).filter(r => CODICI_TRIBUTO_RITENUTE.includes(String(r.codiceTributo || '').trim()));
    if (rr.length) { nF24++; versatoF24 += rr.reduce((t, r) => t + (Number(r.importoPagato) || 0), 0); }
  });
  if (!righe.length && !nF24) return null;
  const dovuto = righe.reduce((t, r) => t + (Number(r.importo) || 0), 0);
  const daPagare = righe.filter(r => !['Pagata', 'Inviata'].includes(r.statoRit)).reduce((t, r) => t + (Number(r.importo) || 0), 0);
  const eccedenza = nF24 > 0 && versatoF24 > dovuto + 0.5;
  let stato = 'verde';
  if (daPagare > 0.004) stato = 'rosso';
  else if (nF24 > 0 && versatoF24 < dovuto - 0.5) stato = 'giallo';
  const eur = (n) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  let messaggio = stato === 'rosso' ? `Ritenute non ancora pagate: ${eur(daPagare)} su ${eur(dovuto)} dovute.`
    : stato === 'giallo' ? `Tutte segnate pagate, ma gli F24 registrati (codice ${CODICI_TRIBUTO_RITENUTE.join('/')}) versano ${eur(versatoF24)} contro ${eur(dovuto)} dovute.`
    : `Ritenute dovute ${eur(dovuto)}: tutte pagate.`;
  if (eccedenza) messaggio += ` Eccedenza: gli F24 versano ${eur(versatoF24)}, ${eur(versatoF24 - dovuto)} più del dovuto (versamento doppio?).`;
  if (stato === 'verde' && !nF24 && dovuto > 0) messaggio += ' Nessun F24 con codice ritenute registrato in Prisma: verifica non fatta sugli F24.';
  return { anno, stato, eccedenza, dovuto, daPagare, versatoF24, nF24, differenza: versatoF24 - dovuto, messaggio };
}
function semaforo770Html(q) {
  if (!q) return '<span class="helptext">—</span>';
  return `<span class="sem770 ${q.stato}" title="${escapeHtml(q.messaggio)}"><span class="dot"></span>${q.eccedenza ? '<span class="esc">!</span>' : ''}</span>`;
}
let RIT770_ANNO = null;
function pannelloQuadratura770() {
  const anno = RIT770_ANNO || STATE.annoCorrente;
  const anni = new Set([STATE.annoCorrente, STATE.annoCorrente - 1]);
  (STATE.ritenuteRighe || []).forEach(r => { if (r.dataPagamento) anni.add(Number(String(r.dataPagamento).slice(0, 4))); });
  const ids = new Set((STATE.ritenuteRighe || []).map(r => r.clienteId));
  (STATE.f24 || []).forEach(f => { if (righeF24(f).some(r => CODICI_TRIBUTO_RITENUTE.includes(String(r.codiceTributo || '').trim()))) ids.add(f.clienteId); });
  const righeQ = Array.from(ids).map(id => ({ id, q: quadratura770(id, anno) })).filter(x => x.q)
    .sort((a, b) => ({ rosso: 0, giallo: 1, verde: 2 }[a.q.stato] - { rosso: 0, giallo: 1, verde: 2 }[b.q.stato]) || nomeCliente(a.id).localeCompare(nomeCliente(b.id)));
  const eur = (n) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `<div class="card" id="cardQuadratura770">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
      <div class="section-title" style="margin:0;">Quadratura 770</div>
      <div class="field" style="margin:0;"><select data-action="rit770-anno">${Array.from(anni).sort((a, b) => b - a).map(a => `<option value="${a}" ${a === anno ? 'selected' : ''}>Ritenute operate nel ${a}</option>`).join('')}</select></div>
      <span class="helptext" style="flex:1;min-width:240px;"><span class="sem770 rosso"><span class="dot"></span></span> ritenute non pagate · <span class="sem770 verde"><span class="dot"></span></span> tutte pagate · <span class="sem770 giallo"><span class="dot"></span></span> F24 registrati inferiori al dovuto · <span class="sem770 verde"><span class="dot"></span><span class="esc">!</span></span> eccedenza (versato più del dovuto)</span>
    </div>
    ${righeQ.length ? `<table class="compact"><thead><tr><th></th><th>Cliente</th><th style="text-align:right;">Dovute</th><th style="text-align:right;">Da pagare</th><th style="text-align:right;">Versate con F24</th><th>Note</th></tr></thead><tbody>
      ${righeQ.map(({ id, q }) => `<tr><td>${semaforo770Html(q)}</td><td>${escapeHtml(nomeCliente(id))}</td><td style="text-align:right;">${eur(q.dovuto)}</td><td style="text-align:right;">${q.daPagare > 0.004 ? '<b>' + eur(q.daPagare) + '</b>' : '—'}</td><td style="text-align:right;">${q.nF24 ? eur(q.versatoF24) : '—'}</td><td class="helptext">${escapeHtml(q.messaggio)}</td></tr>`).join('')}
    </tbody></table>` : '<div class="helptext">Nessuna ritenuta per questo anno.</div>'}
  </div>`;
}

function renderRitenute() {
  // I placeholder (dataPagamento non ancora impostata) vanno in cima: sono quelli che
  // richiedono un'azione da parte dello studio (chiedere/verificare quando il cliente paga).
  const righe = STATE.ritenuteRighe.slice().sort((a,b) => (a.dataPagamento||'').localeCompare(b.dataPagamento||''));
  const { scadenzaPerRigaId, inAttesaPerRigaId } = calcolaScadenzeRitenute(righe);
  const nPlaceholder = righe.filter(r => !r.dataPagamento).length;

  let listaFiltrata = righe;
  if (RIT_FILTRO_CLIENTE !== 'Tutti') listaFiltrata = righe.filter(r => r.clienteId === RIT_FILTRO_CLIENTE);

  const clientiConRitenute = Array.from(new Set(righe.map(r => r.clienteId)));
  const toolbar = `<div class="toolbar">
    <div class="field"><label>Cliente</label><select data-action="rit-filtro-cliente">
      <option value="Tutti" ${RIT_FILTRO_CLIENTE==='Tutti'?'selected':''}>Tutti</option>
      ${clientiConRitenute.map(id=>`<option value="${id}" ${RIT_FILTRO_CLIENTE===id?'selected':''}>${escapeHtml(nomeCliente(id))}</option>`).join('')}
    </select></div>
    <div class="field" style="margin-left:auto;"><label>&nbsp;</label><button class="btn primary" data-action="nuova-ritenuta">+ Nuova ritenuta</button></div>
  </div>`;

  const helptext = `<div class="helptext" style="margin-bottom:12px;">Cumulo automatico sotto soglia (art. 8 DPR 542/1999): se il totale ritenute di un cliente nel mese è sotto ${SOGLIA_CUMULO_RITENUTE}€, il versamento slitta al mese successivo — cumulando finché non si supera la soglia, comunque non oltre dicembre.${nPlaceholder ? ` <strong>${nPlaceholder} riga/e</strong> in attesa che il cliente paghi la fattura: imposta la data di pagamento quando arriva, la scadenza F24 si genera da sola.` : ''}</div>`;

  if (righe.length === 0) {
    return pannelloQuadratura770() + toolbar + `<div class="card"><div class="empty"><div class="big">Nessuna ritenuta registrata</div>Aggiungi una riga per ogni fattura con ritenuta d'acconto: lo scadenzario F24 si genera da solo.</div></div>`;
  }

  const pag = paginaLista('ritenute', listaFiltrata);
  const righeHtml = pag.pagina.map(r => {
    const scad = scadenzaPerRigaId[r.id];
    const inAttesa = inAttesaPerRigaId[r.id];
    const isPlaceholder = !r.dataPagamento;
    return `<tr${isPlaceholder ? ' style="background:var(--giallo-bg);"' : ''}>
      <td>${isPlaceholder
        ? `<input type="date" data-action="rit-imposta-pagamento" data-id="${r.id}" title="Imposta la data in cui il cliente ha pagato la fattura">`
        : fmtData(r.dataPagamento)}</td>
      <td>${fmtData(r.dataFattura)}</td>
      <td>${escapeHtml(nomeCliente(r.clienteId))}</td>
      <td>${escapeHtml(r.percipiente)}</td>
      <td style="text-align:right;">€ ${(Number(r.importo)||0).toLocaleString('it-IT',{minimumFractionDigits:2})}</td>
      <td>${isPlaceholder ? '<span class="badge stato-da-fare">in attesa di pagamento</span>' : (inAttesa ? '<span class="badge stato-da-fare">in cumulo</span>' : (scad?fmtData(scad):'—'))}</td>
      <td><select data-action="rit-cambia-stato" data-id="${r.id}" ${isPlaceholder?'disabled title="Imposta prima la data di pagamento"':''}>
        ${STATI_RITENUTA.map(s=>`<option ${r.statoRit===s?'selected':''}>${s}</option>`).join('')}
      </select></td>
      <td><button class="btn small danger" data-action="elimina-ritenuta" data-id="${r.id}">Elimina</button></td>
    </tr>`;
  }).join('');

  return pannelloQuadratura770() + toolbar + helptext + `<div class="card" style="padding:0;overflow-x:auto;">
    <table class="compact"><thead><tr><th>Data pag.</th><th>Data fatt.</th><th>Cliente</th><th>Percipiente</th><th>Importo</th><th>Scadenza F24</th><th>Stato</th><th></th></tr></thead>
    <tbody>${righeHtml}</tbody></table>
  </div>` + controlliPaginazione(pag);
}

function modalRitenuta() {
  if (STATE.clienti.length === 0) { toast('Aggiungi prima almeno un cliente.'); return; }
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:520px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>Nuova ritenuta d'acconto</h2><div class="modal-sub">Una riga per ogni fattura con ritenuta.</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <form id="formRitenuta" onsubmit="return false;">
        <div class="grid2">
          <div class="field"><label>Cliente *</label><select id="rCliente">${STATE.clienti.filter(c=>clienteAttivo(c)).map(c=>`<option value="${c.id}">${escapeHtml(c.ragioneSociale)}</option>`).join('')}</select></div>
          <div class="field"><label>Percipiente / Fornitore *</label><input id="rPercipiente" required></div>
          <div class="field"><label>Data fattura *</label><input type="date" id="rDataFattura" required></div>
          <div class="field"><label>Data pagamento</label><input type="date" id="rDataPagamento"></div>
          <div class="field"><label>Numero fattura</label><input id="rNumeroFattura"></div>
          <div class="field"><label>Importo ritenuta (€) *</label><input type="number" step="0.01" id="rImporto" required></div>
        </div>
        <div class="helptext" style="margin-top:10px;">Se non sai ancora quando il cliente pagherà la fattura, lascia vuota la data di pagamento: la riga resta come promemoria ("in attesa di pagamento") e non genera nessuna scadenza F24 finché non gliela imposti, dalla tabella, quando il pagamento arriva.</div>
      </form>
      <div class="modal-actions">
        <button class="btn" data-action="chiudi-modal">Annulla</button>
        <button class="btn primary" data-action="salva-ritenuta">Salva</button>
      </div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
}

/* -------------------- RENDER: ADEMPIMENTI ANNUALI -------------------- */
let ANN_FILTRO = { tipo: 'Tutti', resp: 'Tutti', stato: 'Tutti', q: '' };
let ANN_EXPANDED = new Set();

function renderAnnuali() {
  const { annuali } = derivati();
  let lista = annuali;
  if (ANN_FILTRO.tipo !== 'Tutti') lista = lista.filter(a => a.tipoChiave === ANN_FILTRO.tipo);
  if (ANN_FILTRO.resp !== 'Tutti') lista = lista.filter(a => a.responsabile === ANN_FILTRO.resp);
  if (ANN_FILTRO.stato === 'Completati') lista = lista.filter(a => a.completato);
  if (ANN_FILTRO.stato === 'Da completare') lista = lista.filter(a => !a.completato);
  if (ANN_FILTRO.q) lista = lista.filter(a => nomeCliente(a.clienteId).toLowerCase().includes(ANN_FILTRO.q.toLowerCase()));
  lista = lista.slice().sort((a,b) => nomeCliente(a.clienteId).localeCompare(nomeCliente(b.clienteId)) || a.tipoNome.localeCompare(b.tipoNome));

  const totale = annuali.length, completatiN = annuali.filter(a=>a.completato).length;
  const kpi = `<div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);">
    <div class="kpi completati"><div class="n">${totale}</div><div class="l">TOTALE ADEMPIMENTI</div></div>
    <div class="kpi futuri"><div class="n">${completatiN}</div><div class="l">COMPLETATI</div></div>
    <div class="kpi inscadenza"><div class="n">${totale-completatiN}</div><div class="l">DA COMPLETARE</div></div>
  </div>`;

  const toolbar = `<div class="toolbar">
    <div class="field"><label>Tipo</label><select data-action="ann-filtro-tipo">
      <option value="Tutti" ${ANN_FILTRO.tipo==='Tutti'?'selected':''}>Tutti</option>
      ${(() => {
        const perCategoria = new Map();
        TIPI_ADEMPIMENTO.forEach(t => perCategoria.set(t, []));
        catalogoAnnualeTutti().forEach(c => {
          const cat = c.tipo || TIPO_ADEMPIMENTO_DEFAULT;
          if (!perCategoria.has(cat)) perCategoria.set(cat, []);
          perCategoria.get(cat).push(c);
        });
        return Array.from(perCategoria.entries()).filter(([, vs]) => vs.length).map(([cat, vs]) => `<optgroup label="${escapeHtml(cat)}">
          ${vs.map(c=>`<option value="${c.chiave}" ${ANN_FILTRO.tipo===c.chiave?'selected':''}>${escapeHtml(c.nome)}</option>`).join('')}
        </optgroup>`).join('');
      })()}
    </select></div>
    <div class="field"><label>Responsabile</label><select data-action="ann-filtro-resp">
      <option value="Tutti" ${ANN_FILTRO.resp==='Tutti'?'selected':''}>Tutti</option>
      ${STATE.meta.responsabili.map(r=>`<option ${ANN_FILTRO.resp===r?'selected':''}>${escapeHtml(r)}</option>`).join('')}
    </select></div>
    <div class="field"><label>Stato</label><select data-action="ann-filtro-stato">
      ${['Tutti','Da completare','Completati'].map(s=>`<option ${ANN_FILTRO.stato===s?'selected':''}>${s}</option>`).join('')}
    </select></div>
    <div class="field grow"><label>Cerca cliente</label><input type="text" value="${escapeHtml(ANN_FILTRO.q)}" data-action="ann-filtro-q" placeholder="Nome cliente..."></div>
  </div>`;

  if (annuali.length === 0) {
    return kpi + toolbar + `<div class="card"><div class="empty"><div class="big">Nessun adempimento annuale applicabile</div>Nell'anagrafica cliente, seleziona quali adempimenti annuali applicare (Dichiarazione IVA, CU, Bilancio...).</div></div>`;
  }
  if (lista.length === 0) {
    return kpi + toolbar + `<div class="card"><div class="empty">Nessun adempimento corrisponde ai filtri.</div></div>`;
  }

  const pag = paginaLista('annuali', lista);
  const righe = pag.pagina.map(a => {
    const expanded = ANN_EXPANDED.has(a.id);
    const sottoHtml = a.sotto.map((s, idx) => `
      <div class="subtask-row ${s.completato?'done':''}">
        <input type="checkbox" data-action="ann-toggle-sotto" data-id="${a.id}" data-idx="${idx}" ${s.completato?'checked':''}>
        <div class="name" style="flex:1;">${escapeHtml(s.nome)}${s.fase === 'pronta' ? ' <span class="badge stato-da-fare">▶ Pronta</span>' : (s.fase === 'attesa' ? ' <span class="badge info">⏳ In attesa</span>' : '')}${s.completato && !s.completatoDa && (STATE.meta.responsabili || []).length > 1 ? ' <span class="helptext" style="white-space:nowrap;" title="Al momento della spunta non era selezionato nessun operatore">✔ fatto (chi? non indicato)</span>' : ''}${s.completato && s.completatoDa ? ` <span class="helptext" style="white-space:nowrap;" title="Chi ha spuntato questa fase">✔ fatto da <b>${escapeHtml(s.completatoDa)}</b>${s.responsabile && s.completatoDa !== s.responsabile ? ' (assegnata a ' + escapeHtml(s.responsabile) + ')' : ''}</span>` : ''}</div>
        <input type="date" value="${s.data||''}" data-action="ann-data-sotto" data-id="${a.id}" data-idx="${idx}" style="border:1px solid var(--border);border-radius:5px;padding:3px 5px;font-size:11.5px;">
        <select data-action="ann-resp-sotto" data-id="${a.id}" data-idx="${idx}" style="border:1px solid var(--border);border-radius:5px;padding:3px 5px;font-size:11.5px;">
          <option value="">Resp.</option>
          ${STATE.meta.responsabili.map(r=>`<option ${s.responsabile===r?'selected':''}>${escapeHtml(r)}</option>`).join('')}
        </select>
      </div>`).join('');
    return `<div class="card" style="padding:14px 16px;">
      <div style="display:flex;align-items:center;gap:12px;cursor:pointer;" data-action="ann-toggle-expand" data-id="${a.id}">
        <div style="flex:1;">
          <div style="font-weight:700;font-size:13.5px;">${escapeHtml(a.tipoNome)} <span style="font-weight:400;color:var(--text-mut);">— ${escapeHtml(nomeCliente(a.clienteId))}</span></div>
          <div class="helptext">${escapeHtml(a.responsabile||'—')} ${a.scadenza?(' · scad. '+fmtData(a.scadenza)):''}${a.faseCorrente ? ' · fase attuale: ' + escapeHtml(a.faseCorrente.nome) + (a.faseCorrente.responsabile ? ' (' + escapeHtml(a.faseCorrente.responsabile) + ')' : '') : ''}${a.nota ? ' · 📝 ha note' : ''}</div>
        </div>
        ${a.tipoChiave === '770' ? (() => { const q770 = quadratura770(a.clienteId, a.anno - 1); return q770 ? `<div title="Quadratura ritenute operate nel ${a.anno - 1}">${semaforo770Html(q770)}</div>` : ''; })() : ''}
        <div style="width:140px;"><div class="progress"><div style="width:${a.percentuale}%"></div></div></div>
        <div style="width:40px;text-align:right;font-weight:700;">${a.percentuale}%</div>
        ${a.nonDovuto?'<span class="badge info" title="Segnato come non dovuto">Non dovuto</span>':a.completato?'<span class="badge stato-inviato-telematicamente">Completato</span>':'<span class="badge stato-da-fare">In corso</span>'}
        <span style="width:16px;text-align:center;color:var(--text-mut);">${expanded?'▾':'▸'}</span>
      </div>
      ${expanded ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
        <div style="display:flex;gap:12px;margin-bottom:8px;">
          <div class="field"><label>Scadenza</label><input type="date" value="${a.scadenza||''}" data-action="ann-scadenza" data-id="${a.id}" style="min-width:auto;"></div>
          <div class="field"><label>Responsabile</label><select data-action="ann-resp" data-id="${a.id}">
            <option value="">—</option>
            ${STATE.meta.responsabili.map(r=>`<option ${a.responsabile===r?'selected':''}>${escapeHtml(r)}</option>`).join('')}
          </select></div>
        </div>
        <div class="field" style="margin-bottom:10px;"><label>Note sull'adempimento</label><textarea data-action="ann-nota" data-id="${a.id}" placeholder="Appunti utili su questo adempimento (accordi col cliente, particolarità, cosa ricordare l'anno prossimo)..." style="width:100%;min-height:54px;border:1px solid var(--border);border-radius:6px;padding:6px 8px;font-family:inherit;font-size:12.5px;resize:vertical;">${escapeHtml(a.nota||'')}</textarea></div>
        ${ADEMPIMENTI_NON_DOVUTO_POSSIBILE.includes(a.tipoChiave) ? (() => {
          const q = quadratura770(a.clienteId, a.anno - 1);
          const conflitto = a.nonDovuto && q && q.dovuto > 0;
          return `<label class="checkline" style="display:block;margin:2px 0 10px;"><input type="checkbox" data-action="ann-non-dovuto" data-id="${a.id}" ${a.nonDovuto?'checked':''}> <b>Nessuna ritenuta operata nel ${a.anno - 1}</b> — ${escapeHtml(a.tipoNome)} non dovuto</label>`
            + (a.nonDovuto && (a.nonDovutoDa || a.nonDovutoData) ? `<div class="helptext" style="margin:-6px 0 10px;">Segnato${a.nonDovutoDa ? ' da <b>' + escapeHtml(a.nonDovutoDa) + '</b>' : ''}${a.nonDovutoData ? ' il ' + fmtData(a.nonDovutoData) : ''}.</div>` : '')
            + (conflitto ? `<div style="margin:0 0 10px;padding:8px 10px;border-left:4px solid var(--rosso);background:var(--rosso-bg);border-radius:6px;font-size:12.5px;">⚠ In Prisma risultano ritenute per ${q.dovuto.toLocaleString('it-IT', { minimumFractionDigits: 2 })} € nel ${a.anno - 1}: controlla prima di considerare l'adempimento non dovuto.</div>` : '');
        })() : ''}
        <div style="${a.nonDovuto ? 'opacity:.45;pointer-events:none;' : ''}">
        <div style="font-size:11.5px;font-weight:700;color:var(--text-mut);text-transform:uppercase;margin-bottom:4px;">Sotto-adempimenti (${a.sotto.filter(s=>s.completato).length}/${a.sotto.length})</div>
        ${sottoHtml}
        </div>
      </div>` : ''}
    </div>`;
  }).join('');

  return kpi + toolbar + righe + controlliPaginazione(pag);
}

/* -------------------- RENDER: ONBOARDING -------------------- */
let ONBOARD_SELECTED = null;

// Task richiesto da Matteo: con più di 100 clienti scorrere la colonna a sinistra per trovarne
// uno era uno spreco di tempo, sia in Onboarding sia in Antiriciclaggio (stesso layout a due
// colonne). Persistita come le altre variabili di filtro dell'app (es. CLI_FILTRO): sopravvive ai
// render() successivi (es. quando si spunta una voce della checklist), il campo resta a fuoco
// grazie a restoreFocus (stesso pattern di 'cli-filtro-q').
let ONBOARD_FILTRO_Q = '';
function renderOnboarding() {
  if (VIEW_PARAMS.clienteId) { ONBOARD_SELECTED = VIEW_PARAMS.clienteId; VIEW_PARAMS = {}; }
  const attivi = STATE.clienti.filter(c => clienteAttivo(c)).sort((a,b)=>a.ragioneSociale.localeCompare(b.ragioneSociale));
  if (attivi.length === 0) {
    return `<div class="card"><div class="empty"><div class="big">Nessun cliente attivo</div>Aggiungi un cliente per iniziare la checklist di onboarding.</div></div>`;
  }
  if (!ONBOARD_SELECTED || !attivi.find(c=>c.id===ONBOARD_SELECTED)) ONBOARD_SELECTED = attivi[0].id;

  const q = ONBOARD_FILTRO_Q.trim().toLowerCase();
  const filtrati = q ? attivi.filter(c => c.ragioneSociale.toLowerCase().includes(q)) : attivi;
  const ricerca = `<input type="text" value="${escapeHtml(ONBOARD_FILTRO_Q)}" placeholder="Cerca cliente..." data-action="onboard-filtro-q" autocomplete="off" style="margin-bottom:8px;">`;
  const listaHtml = filtrati.length ? filtrati.map(c => {
    const pct = percentualeOnboarding(STATE.onboarding[c.id]);
    const sel = c.id === ONBOARD_SELECTED;
    return `<div class="client-row" style="${sel?'border-color:var(--blu-mid);background:#f4f8fc;':''}margin-bottom:6px;" data-action="onboard-seleziona" data-id="${c.id}">
      <div><div class="name" style="font-size:12.5px;">${escapeHtml(c.ragioneSociale)}</div></div>
      <div class="right"><div style="width:70px;"><div class="progress"><div style="width:${pct}%"></div></div></div><div style="width:32px;text-align:right;font-weight:700;font-size:12px;">${pct}%</div></div>
    </div>`;
  }).join('') : `<div class="empty" style="padding:14px 4px;">Nessun cliente trovato.</div>`;

  const cliente = clienteById(ONBOARD_SELECTED);
  const voci = STATE.onboarding[ONBOARD_SELECTED] || nuovoOnboarding();
  const pct = percentualeOnboarding(voci);
  const categorie = Array.from(new Set(ONBOARDING_DEF.map(v=>v.categoria)));
  const checklistHtml = categorie.map(cat => `
    <div style="margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.03em;margin-bottom:6px;">${escapeHtml(cat)}</div>
      ${ONBOARDING_DEF.filter(v=>v.categoria===cat).map(v => `
        <label class="checkline"><input type="checkbox" data-action="onboard-toggle" data-chiave="${v.chiave}" ${voci[v.chiave]?'checked':''}> ${escapeHtml(v.nome)}</label>
      `).join('')}
    </div>`).join('');

  const apertura = Array.isArray(voci.apertura) ? voci.apertura : [];
  const aperturaHtml = apertura.length ? `<div style="margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.03em;margin-bottom:6px;">Apertura posizioni</div>
      ${apertura.map(x => `<label class="checkline"><input type="checkbox" data-action="onboard-apertura-toggle" data-chiave="${escapeHtml(x.chiave)}" ${x.fatto ? 'checked' : ''}> ${escapeHtml(x.nome)}${x.fatto && x.fattoDa ? ` <span class="helptext" style="display:inline;">— ${escapeHtml(x.fattoDa)}, ${escapeHtml(fmtData(x.fattoIl))}</span>` : ''}</label>`).join('')}
    </div>` : '';
  return `<div style="display:grid;grid-template-columns:280px 1fr;gap:18px;align-items:flex-start;">
    <div class="card">${ricerca}${listaHtml}</div>
    <div class="card">
      <div class="section-title">${escapeHtml(cliente.ragioneSociale)} <span class="cnt">${pct}% completato</span></div>
      <div class="progress" style="margin-bottom:16px;"><div style="width:${pct}%"></div></div>
      ${aperturaHtml}
      ${checklistHtml}
    </div>
  </div>`;
}

/* -------------------- RENDER: ANTIRICICLAGGIO (task #119) -------------------- */
let AML_SELECTED = null;
function statoRevisioneAml(fascicolo) {
  if (!fascicolo.scadenzaRevisione) return { txt: 'Da pianificare', cls: 'info' };
  const delta = giorniTra(oggiISO(), fascicolo.scadenzaRevisione);
  if (delta < 0) return { txt: 'Scaduta', cls: 'stato-errore' };
  if (delta <= 30) return { txt: 'In scadenza', cls: 'stato-da-fare' };
  return { txt: 'Nel termine', cls: 'stato-inviato-telematicamente' };
}
function classeRischioAml(profilo) {
  if (profilo === 'Alto') return 'stato-errore';
  if (profilo === 'Medio') return 'stato-da-fare';
  if (profilo === 'Basso') return 'stato-inviato-telematicamente';
  return 'info';
}

let AML_FILTRO_Q = '';
function renderAntiriciclaggio() {
  if (VIEW_PARAMS.clienteId) { AML_SELECTED = VIEW_PARAMS.clienteId; VIEW_PARAMS = {}; }
  const attivi = STATE.clienti.filter(c => clienteAttivo(c)).sort((a,b)=>a.ragioneSociale.localeCompare(b.ragioneSociale));
  if (attivi.length === 0) {
    return `<div class="card"><div class="empty"><div class="big">Nessun cliente attivo</div>Aggiungi un cliente per aprire un fascicolo antiriciclaggio.</div></div>`;
  }
  if (!AML_SELECTED || !attivi.find(c=>c.id===AML_SELECTED)) AML_SELECTED = attivi[0].id;

  const rischioAlto = attivi.filter(c => (STATE.antiriciclaggio[c.id]||{}).profiloRischio === 'Alto').length;
  const revisioneScaduta = attivi.filter(c => { const f = STATE.antiriciclaggio[c.id]; return f && f.scadenzaRevisione && giorniTra(oggiISO(), f.scadenzaRevisione) < 0; }).length;
  const fascicoliCompleti = attivi.filter(c => percentualeAntiriciclaggio(STATE.antiriciclaggio[c.id]) === 100).length;

  // Colonna stretta (280px, vedi layout più sotto): 3 KPI affiancati ci stavano a malapena, testo
  // ed etichette schiacciati - in riga orizzontale invece di griglia, numero e testo sulla stessa
  // linea, molto più leggibile in poco spazio.
  const kpiRiga = (n, label, cls) => `<div class="kpi-riga ${cls}" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:8px;background:var(--bg);margin-bottom:6px;">
    <span style="font-size:11px;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.02em;">${escapeHtml(label)}</span>
    <span class="n" style="font-size:17px;font-weight:800;">${n}</span>
  </div>`;
  const kpi = `<div style="margin-bottom:10px;">
    ${kpiRiga(fascicoliCompleti, 'Completi', '')}
    ${kpiRiga(rischioAlto, 'Rischio alto', rischioAlto ? 'kpi-riga-allerta' : '')}
    ${kpiRiga(revisioneScaduta, 'Revisioni scadute', revisioneScaduta ? 'kpi-riga-allerta' : '')}
  </div>`;

  const qAml = AML_FILTRO_Q.trim().toLowerCase();
  const filtratiAml = qAml ? attivi.filter(c => c.ragioneSociale.toLowerCase().includes(qAml)) : attivi;
  const ricercaAml = `<input type="text" value="${escapeHtml(AML_FILTRO_Q)}" placeholder="Cerca cliente..." data-action="aml-filtro-q" autocomplete="off" style="margin-bottom:8px;">`;
  const listaHtml = filtratiAml.length ? filtratiAml.map(c => {
    const f = STATE.antiriciclaggio[c.id];
    const pct = percentualeAntiriciclaggio(f);
    const sel = c.id === AML_SELECTED;
    const rischio = (f && f.profiloRischio) || 'Non valutato';
    return `<div class="client-row" style="${sel?'border-color:var(--blu-mid);background:#f4f8fc;':''}margin-bottom:6px;" data-action="aml-seleziona" data-id="${c.id}">
      <div><div class="name" style="font-size:12.5px;">${escapeHtml(c.ragioneSociale)}</div><span class="badge ${classeRischioAml(rischio)}" style="font-size:9.5px;margin-top:3px;display:inline-block;">${escapeHtml(rischio)}</span></div>
      <div class="right"><div style="width:60px;"><div class="progress"><div style="width:${pct}%"></div></div></div><div style="width:32px;text-align:right;font-weight:700;font-size:12px;">${pct}%</div></div>
    </div>`;
  }).join('') : `<div class="empty" style="padding:14px 4px;">Nessun cliente trovato.</div>`;

  const cliente = clienteById(AML_SELECTED);
  const fascicolo = fascicoloAntiriciclaggio(AML_SELECTED);
  const pct = percentualeAntiriciclaggio(fascicolo);
  const categorie = Array.from(new Set(AML_CHECKLIST_DEF.map(v=>v.categoria)));
  const checklistHtml = categorie.map(cat => `
    <div style="margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.03em;margin-bottom:6px;">${escapeHtml(cat)}</div>
      ${AML_CHECKLIST_DEF.filter(v=>v.categoria===cat).map(v => `
        <label class="checkline"><input type="checkbox" data-action="aml-toggle-checklist" data-chiave="${v.chiave}" ${fascicolo.checklist[v.chiave]?'checked':''}> ${escapeHtml(v.nome)}</label>
      `).join('')}
    </div>`).join('');

  const revisione = statoRevisioneAml(fascicolo);
  const val = fascicolo.valutazione;
  const valutazioneBlocco = `<div style="border:1px solid var(--border);border-radius:10px;padding:10px 14px;margin-bottom:16px;${fascicolo.valutazioneRichiesta ? 'border-color:var(--giallo);background:var(--giallo-bg);' : ''}">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
      <div><b style="font-size:13px;">Valutazione del rischio</b>
        <div class="helptext" style="margin-top:2px;">${val ? `${escapeHtml(val.esito.grado)} · adeguata verifica ${escapeHtml(val.esito.verifica)} · del ${escapeHtml(fmtData(val.data))}, dichiarazione valida fino al ${escapeHtml(fmtData(val.scadenza))}` : (fascicolo.valutazioneRichiesta ? '⚠ Preventivo accettato: da fare prima di mandato e dichiarazione.' : 'Non ancora eseguita.')}</div></div>
      <button class="btn small ${val ? '' : 'primary'}" data-action="aml-valutazione-apri">${val ? 'Rivedi / rifai la valutazione' : 'Esegui la valutazione'}</button>
    </div></div>`;
  const storico = fascicolo.storico || [];
  const storicoHtml = storico.length
    ? `<div style="max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:8px;">${storico.slice().reverse().map(n => `<div style="padding:5px 0;border-bottom:1px solid var(--border);"><div style="font-size:10.5px;font-weight:700;color:var(--text-mut);text-transform:uppercase;margin-bottom:2px;">${escapeHtml(n.autore || '—')} · ${fmtData(n.data)}</div><div style="font-size:12.5px;white-space:pre-wrap;line-height:1.4;">${escapeHtml(n.testo)}</div></div>`).join('')}</div>`
    : `<div class="helptext" style="margin-bottom:8px;">Nessuna verifica registrata ancora.</div>`;

  /* Sezione Documenti (task #126): stessi documenti da modello di Preventivi e mandati
     (STATE.preventivi), filtrati per questo cliente e per categoria "AML*" — condividono
     interamente motore di generazione, modale di creazione/modifica e azioni con quel modulo. */
  const documentiAml = STATE.preventivi.filter(p => p.clienteId === AML_SELECTED && categoriaEAml(p.categoria)).sort((a,b) => (b.dataEmissione||'').localeCompare(a.dataEmissione||''));
  const modelliAmlAttivi = STATE.modelliDocumento.filter(m => m.attivo && categoriaEAml(m.categoria));
  const documentiAmlHtml = documentiAml.length
    ? documentiAml.map(p => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
        <div><div style="font-weight:600;font-size:12.5px;">${escapeHtml(p.categoria)}</div><div class="helptext" style="margin-top:2px;">${escapeHtml(p.oggetto||'')} · ${fmtDataBreve(p.dataEmissione)}</div></div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <span class="badge ${classeDocumentoStato(p.stato)}">${escapeHtml(p.stato)}</span>
          <button class="btn small" data-action="apri-preventivo" data-id="${p.id}">Apri</button>
          <button class="btn small danger" data-action="elimina-preventivo" data-id="${p.id}">Elimina</button>
        </div>
      </div>`).join('')
    : `<div class="helptext" style="margin-bottom:4px;">Nessun documento antiriciclaggio ancora per questo cliente.</div>`;
  const bottoneNuovoDocAml = modelliAmlAttivi.length
    ? `<button type="button" class="btn small" style="margin-top:8px;" data-action="nuovo-preventivo" data-cliente="${AML_SELECTED}" data-aml="1">+ Nuovo documento</button>`
    : `<div class="helptext" style="margin-top:8px;">Nessun modello antiriciclaggio attivo — <button type="button" class="btn small" data-action="vai-modelli">crea un modello</button> (es. Dichiarazione cliente, Nota di accettazione incarico).</div>`;

  return `<div style="display:grid;grid-template-columns:280px 1fr;gap:18px;align-items:flex-start;">
    <div class="card">${kpi}${ricercaAml}${listaHtml}</div>
    <div class="card">
      <div class="section-title">${escapeHtml(cliente.ragioneSociale)} <span class="cnt">${pct}% completato</span></div>
      <div class="progress" style="margin-bottom:16px;"><div style="width:${pct}%"></div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:18px;">
        <div class="field"><label>Profilo di rischio</label><select data-action="aml-cambia-rischio">${PROFILI_RISCHIO_AML.map(p=>`<option ${fascicolo.profiloRischio===p?'selected':''}>${escapeHtml(p)}</option>`).join('')}</select></div>
        <div class="field"><label>Ultima adeguata verifica</label><input type="date" data-action="aml-cambia-verifica" value="${fascicolo.dataAdeguataVerifica||''}"></div>
        <div class="field"><label>Prossima revisione <span id="amlBadgeRevisione" class="badge ${revisione.cls}" style="margin-left:4px;font-size:9.5px;">${revisione.txt}</span></label><input type="date" data-action="aml-cambia-revisione" value="${fascicolo.scadenzaRevisione||''}"></div>
      </div>
      ${valutazioneBlocco}
      ${checklistHtml}
      <div style="margin-top:6px;">
        <label style="font-size:11px;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.03em;margin-bottom:6px;display:block;">Storico verifiche <span class="cnt" style="font-size:9.5px;font-weight:700;background:var(--bg);border-radius:20px;padding:2px 8px;text-transform:none;letter-spacing:normal;">${storico.length}</span></label>
        ${storicoHtml}
        <textarea id="amlNuovaNota" style="width:100%;min-height:50px;" placeholder="Es. verifica rinnovata, documento aggiornato, esito controllo..."></textarea>
        <button type="button" class="btn small" style="margin-top:6px;" data-action="aml-aggiungi-nota" data-id="${AML_SELECTED}">Aggiungi verifica</button>
      </div>
      <div style="margin-top:18px;">
        <label style="font-size:11px;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.03em;margin-bottom:6px;display:block;">Documenti <span class="cnt" style="font-size:9.5px;font-weight:700;background:var(--bg);border-radius:20px;padding:2px 8px;text-transform:none;letter-spacing:normal;">${documentiAml.length}</span></label>
        ${documentiAmlHtml}
        ${bottoneNuovoDocAml}
      </div>
    </div>
  </div>`;
}

