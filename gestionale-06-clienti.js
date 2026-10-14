'use strict';
/* -------------------- RENDER: CLIENTI -------------------- */
let CLI_FILTRO = { q: '', regime: 'Tutti', resp: 'Tutti', mandatario: 'Tutti', mostraCessati: false, soloIncompleti: false, soloGravi: false };
/* Mandatario: chi ha il mandato con il cliente (studio o singolo professionista). Campo libero con
   suggerimenti: l'elenco nasce dai valori già usati sui clienti. */
function mandatariEsistenti() {
  return Array.from(new Set((STATE.clienti || []).map(c => (c.mandatario || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function renderClienti() {
  const f = CLI_FILTRO;
  let lista = STATE.clienti.filter(c => {
    if (!f.mostraCessati && !clienteAttivo(c)) return false;
    if (f.regime !== 'Tutti' && c.regimeFiscale !== f.regime) return false;
    if (f.resp !== 'Tutti' && c.responsabileStudio !== f.resp) return false;
    if (f.mandatario !== 'Tutti' && (c.mandatario || '') !== f.mandatario) return false;
    if (f.q && !c.ragioneSociale.toLowerCase().includes(f.q.toLowerCase())) return false;
    if (f.soloGravi && livelliMancantiCliente(c).gravi.length === 0) return false;
    if (f.soloIncompleti && campiMancantiCliente(c).length === 0) return false;
    return true;
  }).sort((a,b) => a.ragioneSociale.localeCompare(b.ragioneSociale));

  const nIncompleti = STATE.clienti.filter(c => campiMancantiCliente(c).length > 0).length;
  const nGravi = STATE.clienti.filter(c => livelliMancantiCliente(c).gravi.length > 0).length;
  const attivi = STATE.clienti.filter(c => clienteAttivo(c)).length;

  const toolbar = `<div class="toolbar">
    <div class="field grow"><label>Cerca</label><input type="text" placeholder="Nome o ragione sociale..." value="${escapeHtml(f.q)}" data-action="cli-filtro-q"></div>
    <div class="field"><label>Regime fiscale</label><select data-action="cli-filtro-regime">
      <option ${f.regime==='Tutti'?'selected':''}>Tutti</option>
      ${REGIMI_FISCALI.map(r=>`<option ${f.regime===r?'selected':''}>${r}</option>`).join('')}
    </select></div>
    <div class="field"><label>Responsabile</label><select data-action="cli-filtro-resp">
      <option ${f.resp==='Tutti'?'selected':''}>Tutti</option>
      ${STATE.meta.responsabili.map(r=>`<option ${f.resp===r?'selected':''}>${escapeHtml(r)}</option>`).join('')}
    </select></div>
    ${mandatariEsistenti().length ? `<div class="field"><label>Mandatario</label><select data-action="cli-filtro-mandatario">
      <option ${f.mandatario==='Tutti'?'selected':''}>Tutti</option>
      ${mandatariEsistenti().map(m=>`<option ${f.mandatario===m?'selected':''}>${escapeHtml(m)}</option>`).join('')}
    </select></div>` : ''}
    <div class="field" style="min-width:max-content;"><label>&nbsp;</label><label class="checkline" style="white-space:nowrap;"><input type="checkbox" data-action="cli-filtro-cessati" ${f.mostraCessati?'checked':''}> Mostra cessati e potenziali</label></div>
    <div class="field" style="min-width:max-content;"><label>&nbsp;</label><label class="checkline" style="white-space:nowrap;"><input type="checkbox" data-action="cli-filtro-incompleti" ${f.soloIncompleti?'checked':''}> Solo da completare (${nIncompleti})</label></div>
    <div class="field" style="min-width:max-content;"><label>&nbsp;</label><label class="checkline" style="white-space:nowrap;"><input type="checkbox" data-action="cli-filtro-gravi" ${f.soloGravi?'checked':''}> Solo importanti ⚠ (${nGravi})</label></div>
    <div class="field" style="margin-left:auto;"><label>&nbsp;</label><button class="btn primary" data-action="nuovo-cliente">+ Nuovo cliente</button></div>
  </div>`;

  const toolbarImport = `<div class="toolbar" style="margin-top:-10px;">
    <div class="field"><label>&nbsp;</label><button class="btn small" data-action="scarica-template-clienti">⬇ Scarica template Excel</button></div>
    <div class="field"><label>&nbsp;</label><label class="btn small" style="margin:0;">⬆ Importa clienti (Excel/CSV)<input type="file" accept=".csv,.xlsx,.xls" style="display:none;" data-action="importa-clienti-file"></label></div>
    <div class="field grow"><label>&nbsp;</label><div class="helptext">Il template ha una seconda scheda con i valori ammessi per ogni colonna. I clienti già presenti (stessa Partita IVA o stesso Codice Fiscale) vengono riconosciuti e saltati, non duplicati.</div></div>
  </div>`;

  const bannerIncompleti = nIncompleti ? `<div class="card" style="border-left:4px solid ${nGravi ? 'var(--rosso)' : 'var(--giallo)'};padding:10px 14px;margin-bottom:10px;">${nGravi ? '⚠' : 'ℹ'} <strong>${nIncompleti} client${nIncompleti===1?'e':'i'} da completare</strong>: ${nGravi} con dati <strong>importanti</strong> mancanti (regime, periodicità IVA, responsabile, contabilità, CF/P.IVA), ${nIncompleti - nGravi} solo con dati utili mancanti. L'avviso resta finché i campi non sono compilati. <button class="btn small" data-action="cli-filtro-incompleti-vai">${nGravi ? 'Mostra i ' + nGravi + ' importanti' : 'Mostra'}</button></div>` : '';
  const header = bannerIncompleti + `<div class="section-title">Clienti <span class="cnt">${attivi} attivi · ${lista.length} mostrati</span></div>`;

  if (lista.length === 0) {
    return toolbar + toolbarImport + `<div class="card"><div class="empty"><div class="big">Nessun cliente trovato</div>Prova a cambiare i filtri, oppure aggiungi un nuovo cliente.</div></div>`;
  }

  const pag = paginaLista('clienti', lista);
  const righe = pag.pagina.map(c => {
    const pct = percentualeOnboarding(STATE.onboarding[c.id]);
    return `<div class="client-row" data-action="apri-cliente" data-id="${c.id}">
      <div>
        <div class="name">${escapeHtml(c.ragioneSociale)} ${c.stato==='cessato'?'<span class="badge cessato">CESSATO</span>':''}${c.stato==='potenziale'?'<span class="badge info">POTENZIALE</span>':''}${contabilitaDaTerzi(c)?' <span class="badge" title="Contabilità tenuta da terzi: le scadenze e le fasi sono quelle per contabilità non tenuta dallo studio">contab. terzi</span>':''}${badgeDatiMancanti(c)}</div>
        <div class="meta">${escapeHtml(c.regimeFiscale||'—')} · Resp. ${escapeHtml(c.responsabileStudio||'—')} ${c.mandatario?'· Mandatario '+escapeHtml(c.mandatario):''} ${c.partitaIva?'· P.IVA '+escapeHtml(c.partitaIva):''} ${c.settore?'· '+escapeHtml(c.settore):''}</div>
      </div>
      <div class="right">
        <div style="text-align:right;">
          <div class="helptext">Onboarding</div>
          <div style="font-weight:700;font-size:13px;">${pct}%</div>
        </div>
        <div style="width:90px;"><div class="progress"><div style="width:${pct}%"></div></div></div>
        <button class="btn small" data-action="modifica-cliente" data-id="${c.id}">Modifica</button>
      </div>
    </div>`;
  }).join('');

  return toolbar + toolbarImport + header + righe + controlliPaginazione(pag);
}

/* -------------------- RENDER: RUBRICA (task #135) --------------------
   Vista dedicata di sola consultazione: non ha un proprio STATE, legge i contatti già presenti
   su STATE.clienti.contatti (email, email amministrazione, PEC, telefono, indirizzo) - lo scopo è
   trovare in fretta un recapito senza aprire la scheda cliente, non duplicare l'anagrafica. */
let RUBRICA_FILTRO = { q: '' };

function renderRubrica() {
  const q = (RUBRICA_FILTRO.q || '').trim().toLowerCase();
  let lista = STATE.clienti.filter(c => clienteAttivo(c)).slice().sort((a,b) => a.ragioneSociale.localeCompare(b.ragioneSociale));
  if (q) {
    lista = lista.filter(c => {
      const co = c.contatti || {};
      const testo = [c.ragioneSociale, co.email, co.emailAmministrazione, co.pec, co.telefono, co.localita, c.responsabileStudio].filter(Boolean).join(' ').toLowerCase();
      return testo.includes(q);
    });
  }

  const toolbar = `<div class="toolbar">
    <div class="field grow"><label>Cerca</label><input type="text" placeholder="Nome, email, telefono, città..." value="${escapeHtml(RUBRICA_FILTRO.q)}" data-action="rubrica-filtro-q"></div>
  </div>`;

  const header = `<div class="section-title">Rubrica <span class="cnt">${lista.length} contatti</span></div>`;

  if (lista.length === 0) {
    return toolbar + `<div class="card"><div class="empty"><div class="big">Nessun contatto trovato</div>${STATE.clienti.length===0 ? 'Aggiungi prima qualche cliente in Anagrafiche.' : 'Prova a cambiare la ricerca.'}</div></div>`;
  }

  const pag = paginaLista('rubrica', lista);
  const righe = pag.pagina.map(c => {
    const co = c.contatti || {};
    const recapiti = [
      co.email ? `<a href="mailto:${escapeHtml(co.email)}" title="Email">✉ ${escapeHtml(co.email)}</a>` : '',
      co.emailAmministrazione ? `<a href="mailto:${escapeHtml(co.emailAmministrazione)}" title="Email amministrazione">✉ ${escapeHtml(co.emailAmministrazione)} <span class="helptext" style="display:inline;">(amm.)</span></a>` : '',
      co.pec ? `<a href="mailto:${escapeHtml(co.pec)}" title="PEC">✉ ${escapeHtml(co.pec)} <span class="helptext" style="display:inline;">(PEC)</span></a>` : '',
      co.telefono ? `<a href="tel:${escapeHtml(co.telefono)}" title="Telefono">☎ ${escapeHtml(co.telefono)}</a>` : '',
    ].filter(Boolean).join('<br>');
    const copiaTesto = [co.email, co.telefono].filter(Boolean).join(' · ');
    return `<div class="client-row" style="cursor:default;">
      <div>
        <div class="name" style="cursor:pointer;" data-action="apri-cliente" data-id="${c.id}">${escapeHtml(c.ragioneSociale)}</div>
        <div class="meta">${escapeHtml(co.localita || '—')}${c.responsabileStudio ? ' · Resp. ' + escapeHtml(c.responsabileStudio) : ''}</div>
      </div>
      <div class="right" style="align-items:flex-start;">
        <div style="font-size:13px;line-height:1.7;text-align:right;">${recapiti || '<span class="helptext">Nessun recapito in anagrafica</span>'}</div>
        <div style="display:flex;gap:8px;">
          ${copiaTesto ? `<button class="btn small ghost" data-action="rubrica-copia" data-testo="${escapeHtml(copiaTesto)}">Copia</button>` : ''}
          <button class="btn small" data-action="modifica-cliente" data-id="${c.id}">✎ Modifica</button>
        </div>
      </div>
    </div>`;
  }).join('');

  return toolbar + header + righe + controlliPaginazione(pag);
}

/* -------------------- RENDER: SCHEDA CLIENTE (vista 360°) --------------------
   Il punto di questa pagina: invece di dover girare tra Scadenze, Task, Comunicazioni,
   Contabilità e Bilanci per capire "a che punto siamo con questo cliente", tutto quello
   che lo riguarda è qui in un colpo d'occhio, con collegamenti rapidi alle viste complete
   già filtrate su di lui. */
let SCHEDA_CLIENTE = null;

function renderSchedaCliente() {
  if (VIEW_PARAMS.clienteId) { SCHEDA_CLIENTE = VIEW_PARAMS.clienteId; VIEW_PARAMS = {}; }
  const tutti = STATE.clienti.slice().sort((a,b)=>a.ragioneSociale.localeCompare(b.ragioneSociale));
  if (tutti.length === 0) return `<div class="card"><div class="empty"><div class="big">Nessun cliente in anagrafica</div>Aggiungi il primo cliente per vedere qui la sua scheda completa.</div></div>`;
  if (!SCHEDA_CLIENTE || !tutti.find(c=>c.id===SCHEDA_CLIENTE)) SCHEDA_CLIENTE = tutti[0].id;
  const cliente = clienteById(SCHEDA_CLIENTE);

  const toolbar = `<div class="toolbar">
    <div class="field grow"><label>Cliente</label><select data-action="schcli-seleziona-cliente">
      ${tutti.map(c=>`<option value="${c.id}" ${c.id===SCHEDA_CLIENTE?'selected':''}>${escapeHtml(c.ragioneSociale)}${c.stato==='cessato'?' (cessato)':''}</option>`).join('')}
    </select></div>
    <div class="field"><label>&nbsp;</label><button class="btn small" data-action="modifica-cliente" data-id="${cliente.id}">✎ Modifica anagrafica</button></div>
  </div>`;

  const contatti = cliente.contatti || {};
  const header = `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;">
      <div>
        <div style="font-size:19px;font-weight:800;">${escapeHtml(cliente.ragioneSociale)} ${cliente.stato==='cessato'?'<span class="badge cessato">CESSATO</span>':''}${cliente.stato==='potenziale'?'<span class="badge info">POTENZIALE</span>':''}${contabilitaDaTerzi(cliente)?' <span class="badge" title="Contabilità tenuta da terzi">contab. terzi</span>':''}</div>
        ${(() => { const l = livelliMancantiCliente(cliente); if (!l.gravi.length && !l.leggeri.length) return ''; const g = l.gravi.length > 0; return `<div style="margin-top:6px;padding:8px 10px;border-left:4px solid ${g?'var(--rosso)':'var(--giallo)'};background:${g?'var(--rosso-bg)':'var(--giallo-bg)'};border-radius:6px;font-size:13px;">${g?'⚠':'ℹ'} <strong>Anagrafica da completare</strong>${l.gravi.length ? ` — importanti: <strong>${l.gravi.map(escapeHtml).join(', ')}</strong>` : ''}${l.leggeri.length ? ` — utili: ${l.leggeri.map(escapeHtml).join(', ')}` : ''}. <button class="btn small" data-action="modifica-cliente" data-id="${cliente.id}">Completa ora</button></div>`; })()}
        ${(() => { const nv = STATE.f24.filter(f => f.clienteId === cliente.id && f.ritardoVersamento && statoF24(f) !== 'Pagato'); if (!nv.length) return ''; const tot = nv.reduce((x, f) => x + Math.max(0, (Number(f.importo) || 0) - (Number(f.importoPagato) || 0)), 0); return `<div style="margin-top:6px;padding:8px 10px;border-radius:8px;background:#FBE0CC;color:#B4531A;font-size:12.5px;"><b>⚠ ${nv.length} versament${nv.length === 1 ? 'o' : 'i'} in ritardo</b> (F24 da pagare${tot > 0 ? ': ' + fmtEuro(tot) : ''}): ${nv.map(f => escapeHtml(f.descrizione || 'F24')).join(' · ')}</div>`; })()}
        ${cliente.stato==='cessato' ? `<div class="helptext" style="margin-top:2px;color:var(--rosso);">Cessato${cliente.dataCessazione?' il '+fmtData(cliente.dataCessazione):''}${cliente.motivoCessazione?' · '+escapeHtml(cliente.motivoCessazione):''}</div>` : ''}
        ${(() => { const ce = annualiCedutiCliente(cliente.id); const aperti = derivati().annuali.filter(a => a.clienteId === cliente.id && !a.completato); return cliente.stato==='cessato' ? `<div class="helptext" style="margin-top:2px;">${ce.length ? 'Ceduti al nuovo commercialista: ' + ce.map(x => escapeHtml(x.nome) + ' ' + x.anno).join(', ') : 'Nessun adempimento ceduto'}${aperti.length ? ' · <strong>Ancora in carico allo studio:</strong> ' + aperti.map(a => escapeHtml(a.tipoNome)).join(', ') : ''}</div>` : ''; })()}
        <div style="margin-top:6px;">${cliente.stato==='cessato' ? `<button class="btn small" data-action="riattiva-cliente" data-id="${cliente.id}">Riattiva cliente</button>` : (cliente.stato==='attivo' ? `<button class="btn small" data-action="cessa-cliente-apri" data-id="${cliente.id}">Cessa cliente…</button>` : '')} ${cliente.stato==='attivo' ? `<button class="btn small" data-action="report-mensile-apri" data-cliente="${cliente.id}">Report mensile…</button>` : ''}</div>
      </div>
      <div style="display:flex;gap:22px;">
        <div style="text-align:right;">
          <div class="helptext">Onboarding</div>
          <div style="font-weight:800;font-size:20px;">${percentualeOnboarding(STATE.onboarding[cliente.id])}%</div>
          <button class="btn small" style="margin-top:6px;" data-action="schcli-apri-onboarding" data-cliente="${cliente.id}">Vai →</button>
        </div>
        <div style="text-align:right;">
          <div class="helptext">Antiriciclaggio</div>
          <div style="font-weight:800;font-size:20px;">${percentualeAntiriciclaggio(STATE.antiriciclaggio[cliente.id])}%</div>
          <button class="btn small" style="margin-top:6px;" data-action="schcli-apri-aml" data-cliente="${cliente.id}">Vai →</button>
        </div>
      </div>
    </div>
    ${(() => {
      const v = (x, vuotoGrave) => (x === undefined || x === null || x === '') ? `<span class="sd-v vuoto${vuotoGrave ? ' grave' : ''}">${vuotoGrave ? 'da indicare' : '—'}</span>` : `<span class="sd-v">${x}</span>`;
      const cella = (l, x, g) => `<div class="sd"><span class="sd-l">${l}</span>${v(x, g)}</div>`;
      const yn = (x) => x === 'SI' ? 'Sì' : (x === 'NO' ? 'No' : '');
      const societa = TIPI_SOCIETA.includes(cliente.tipo);
      const ateco = (cliente.atecoCodici || []).map(a => escapeHtml(a)).join(', ');
      const grp = (titolo, celle) => `<div class="sd-gruppo"><div class="sd-titolo">${titolo}</div><div class="sd-griglia">${celle.join('')}</div></div>`;
      return `<div class="scheda-dati">`
        + grp('Anagrafica fiscale', [
            cella('Tipo', escapeHtml(labelTipoCliente(cliente.tipo))),
            cella('Regime fiscale', escapeHtml(cliente.regimeFiscale || ''), true),
            cella('Partita IVA', escapeHtml(cliente.partitaIva || '')),
            cella('Codice fiscale', escapeHtml(cliente.codiceFiscale || '')),
            cella('ATECO', ateco),
            cella('Settore', escapeHtml(cliente.settore || '')),
            cella('Dipendenti', yn(cliente.haDipendenti)),
          ].concat(societa ? [
            cella('PMI innovativa', yn(cliente.pmiInnovativa), !cliente.pmiInnovativa),
            cella('Start-up innovativa', yn(cliente.startupInnovativa), !cliente.startupInnovativa),
            cella('Data di costituzione', cliente.dataCostituzione ? fmtData(cliente.dataCostituzione) : ''),
            cella('Organo di controllo', escapeHtml(cliente.organoControllo || ''), !cliente.organoControllo),
          ] : []))
        + (cliente.tipo === 'associazione' ? (() => { const a = datiAssociazione(cliente); return grp('Associazione', [
            cella('Qualifica', escapeHtml(a.qualifica || '')),
            cella('Personalità giuridica', escapeHtml(a.personalita || ''), !a.personalita),
            cella('Iscrizione RUNTS', escapeHtml(a.runts || ''), !a.runts),
            cella('Sezione RUNTS', escapeHtml(a.sezioneRunts || '')),
            cella('N. repertorio RUNTS', escapeHtml(a.repertorioRunts || '')),
            cella('Delega RUNTS allo studio', escapeHtml(a.delegaRunts || ''), a.runts === 'Iscritta' && !a.delegaRunts),
            cella('Registro sportivo (RASD)', escapeHtml(a.rasd || '')),
          ].concat(a.daFare ? [`<div class="sd" style="grid-column:1/-1;"><span class="sd-l">Cosa fare adesso</span><span class="sd-v" style="white-space:pre-wrap;">${escapeHtml(a.daFare)}</span></div>`] : [])); })() : '')
        + grp('Gestione nello studio', [
            cella('Responsabile', escapeHtml(cliente.responsabileStudio || ''), true),
            cella('Cliente dal', cliente.annoIngresso ? String(cliente.annoIngresso) : ''),
            cella('Contabilità', escapeHtml(({ ESTERNA: 'Tenuta dallo studio', INTERNA: 'Da terzi' })[cliente.contabilita] || cliente.contabilita || ''), true),
            cella('Periodicità IVA', escapeHtml(cliente.periodicitaIva || ''), true),
            cella('Previdenza', escapeHtml(cliente.previdenza || '')),
            cella('Addebito F24', escapeHtml(({ NOI: 'Studio', CLIENTE: 'Cliente', 'NOI/CLIENTE': 'Studio o cliente' })[cliente.addebitoF24] || cliente.addebitoF24 || '')),
          ])
        + grp('Contatti', [
            cella('Email', contatti.email ? `<a href="mailto:${escapeHtml(contatti.email)}">${escapeHtml(contatti.email)}</a>` : ''),
            cella('Telefono', escapeHtml(contatti.telefono || '')),
            cella('PEC', escapeHtml(contatti.pec || '')),
          ])
        + `</div>`;
    })()}
  </div>`;

  const { tutteScadenze, annuali } = derivati();
  const scadenzeCliente = tutteScadenze.filter(s => s.clienteId === cliente.id);
  const { scaduti, inScadenza, futuri, completati } = classificaScadenze(scadenzeCliente, oggiISO());
  const kpiScadenze = `<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
    <div class="kpi scaduti" data-action="schcli-apri-scadenze" data-cliente="${cliente.id}" data-filtro="scaduti"><div class="n">${scaduti.length}</div><div class="l">SCADUTI</div></div>
    <div class="kpi inscadenza" data-action="schcli-apri-scadenze" data-cliente="${cliente.id}" data-filtro="inscadenza"><div class="n">${inScadenza.length}</div><div class="l">IN SCADENZA</div></div>
    <div class="kpi futuri" data-action="schcli-apri-scadenze" data-cliente="${cliente.id}" data-filtro="futuri"><div class="n">${futuri.length}</div><div class="l">FUTURI</div></div>
    <div class="kpi completati" data-action="schcli-apri-scadenze" data-cliente="${cliente.id}" data-filtro="completati"><div class="n">${completati.length}</div><div class="l">COMPLETATI</div></div>
  </div>`;
  const prossime = scaduti.concat(inScadenza).concat(futuri).sort((a,b)=>a.data.localeCompare(b.data)).slice(0,5);
  const rigaScadenzaCliente = (s) => {
    const d = deltaLabel(s.data);
    return `<tr><td>${fmtDataBreve(s.data)}</td><td>${escapeHtml(s.nome)}</td><td><span class="pill-delta ${d.cls}">${d.txt}</span></td><td><span class="badge ${statoBadgeClass(s.stato)}">${escapeHtml(s.stato)}</span></td></tr>`;
  };
  const sezScadenze = `<div class="card">
    <div class="section-title">Scadenze <span class="cnt">${scadenzeCliente.length} totali</span></div>
    ${kpiScadenze}
    ${prossime.length ? `<table style="margin-top:12px;"><thead><tr><th>Data</th><th>Adempimento</th><th>Tra</th><th>Stato</th></tr></thead><tbody>${prossime.map(rigaScadenzaCliente).join('')}</tbody></table>` : '<div class="empty" style="margin-top:8px;">Nessuna scadenza aperta per questo cliente.</div>'}
    <div style="margin-top:10px;"><button class="btn small" data-action="schcli-apri-scadenze" data-cliente="${cliente.id}" data-filtro="tutti">Vedi tutte le scadenze →</button></div>
  </div>`;

  const annualiCliente = annuali.filter(a => a.clienteId === cliente.id);
  const annualiIncompleti = annualiCliente.filter(a => !a.completato);
  const sezAnnuali = annualiCliente.length === 0 ? '' : `<div class="card">
    <div class="section-title">Adempimenti annuali <span class="cnt">${annualiIncompleti.length} da completare</span></div>
    ${annualiIncompleti.length ? annualiIncompleti.map(a => `
      <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="flex:1;font-weight:600;font-size:13px;">${escapeHtml(a.tipoNome)}</div>
        <div style="width:120px;"><div class="progress"><div style="width:${a.percentuale}%"></div></div></div>
        <div style="width:38px;text-align:right;font-weight:700;font-size:12.5px;">${a.percentuale}%</div>
      </div>`).join('') : '<div class="empty">Tutto completato per quest\'anno.</div>'}
    <div style="margin-top:10px;"><button class="btn small" data-action="nav" data-nav="annuali">Vai agli adempimenti annuali →</button></div>
  </div>`;

  const taskCliente = STATE.taskTeam.filter(t => t.clienteId === cliente.id);
  const taskAperti = taskCliente.filter(t => t.stato !== 'Fatto').sort((a,b)=>(a.scadenza||'9999').localeCompare(b.scadenza||'9999'));
  const sezTask = `<div class="card">
    <div class="section-title">Task team <span class="cnt">${taskAperti.length} aperti</span></div>
    ${taskAperti.length ? taskAperti.slice(0,5).map(t => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;" data-action="apri-dettaglio-task-team" data-id="${t.id}">
        <div style="flex:1;">
          <div style="font-weight:600;font-size:13px;">${escapeHtml(t.titolo)} ${taskInRitardo(t)?'<span class="pill-delta scaduto">In ritardo</span>':''}</div>
          <div class="helptext">${escapeHtml(t.assegnatoA)}${t.scadenza?' · '+fmtDataBreve(t.scadenza):''}</div>
        </div>
      </div>`).join('') : '<div class="empty">Nessun task aperto per questo cliente.</div>'}
    <div style="margin-top:10px;display:flex;gap:10px;">
      <button class="btn small primary" data-action="nuovo-task-team" data-cliente="${cliente.id}">+ Nuovo task</button>
      <button class="btn small" data-action="schcli-apri-task" data-cliente="${cliente.id}">Vedi tutti →</button>
    </div>
  </div>`;

  const comCliente = STATE.comunicazioni.filter(c => c.clienteId === cliente.id).sort((a,b)=>(b.data||'').localeCompare(a.data||'') || (b.creataIl||'').localeCompare(a.creataIl||''));
  const sezCom = `<div class="card">
    <div class="section-title">Comunicazioni <span class="cnt">${comCliente.length} totali</span></div>
    ${comCliente.length ? comCliente.slice(0,3).map(c => `
      <div style="padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="font-weight:600;font-size:13px;">${escapeHtml(c.oggetto)}</div>
        <div class="helptext">${fmtDataBreve(c.data)} · <span class="badge info">${escapeHtml(categoriaComunicazione(c))}</span> · ${escapeHtml(c.stato)}</div>
      </div>`).join('') : '<div class="empty">Nessuna comunicazione ancora inviata a questo cliente.</div>'}
    <div style="margin-top:10px;display:flex;gap:10px;">
      <button class="btn small primary" data-action="nuova-comunicazione" data-cliente="${cliente.id}">+ Nuova comunicazione</button>
      <button class="btn small" data-action="schcli-apri-comunicazioni" data-cliente="${cliente.id}">Vedi tutte →</button>
    </div>
  </div>`;

  const statoContab = statoAggiornamentoDocumenti(cliente.id);
  // Task #176: tab sospeso di default - niente scorciatoia verso una sezione che
  // operatorePuoVedere() bloccherebbe comunque. I dati (statoAggiornamentoDocumenti) restano
  // intatti e la card torna a comparire da sola se/quando si riattiva da Impostazioni › Sviluppatore.
  const sezContab = STATE.meta.contabilitaAttiva ? `<div class="card">
    <div class="section-title">Contabilità</div>
    ${statoContab.length ? `<div class="kpi-grid" style="grid-template-columns:repeat(auto-fill, minmax(160px,1fr));">
      ${statoContab.map(s => `<div class="kpi completati"><div class="n" style="font-size:14px;">${escapeHtml(s.data)}</div><div class="l">${escapeHtml(s.etichetta)}</div></div>`).join('')}
    </div>` : '<div class="empty">Nessun documento contabile ancora registrato per questo cliente.</div>'}
    <div style="margin-top:10px;"><button class="btn small" data-action="schcli-apri-contabilita" data-cliente="${cliente.id}">Apri Contabilità →</button></div>
  </div>` : '';

  const anniBil = anniBilancioCliente(cliente.id);
  let sezBilanci;
  if (anniBil.length === 0) {
    sezBilanci = `<div class="card"><div class="section-title">Bilanci & KPI</div><div class="empty">Nessun bilancio caricato per questo cliente.</div>
      <div style="margin-top:10px;"><button class="btn small" data-action="schcli-apri-bilanci" data-cliente="${cliente.id}">Apri Bilanci & KPI →</button></div>
    </div>`;
  } else {
    const ultimoAnno = anniBil[anniBil.length-1];
    const d = calcolaDerivatiBilancio(STATE.bilanci[cliente.id][ultimoAnno]);
    sezBilanci = `<div class="card">
      <div class="section-title">Bilanci & KPI <span class="cnt">${escapeHtml(etichettaEstesaBilancio(ultimoAnno))}</span></div>
      <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
        <div class="kpi completati"><div class="n" style="font-size:18px;">${fmtEuro(d.ricavi)}</div><div class="l">Ricavi</div></div>
        <div class="kpi completati"><div class="n" style="font-size:18px;">${fmtPct(d.roe)}</div><div class="l">ROE</div></div>
        <div class="kpi completati"><div class="n" style="font-size:18px;">${fmtPct(d.roi)}</div><div class="l">ROI</div></div>
        <div class="kpi completati"><div class="n" style="font-size:18px;">${fmtPct(d.ebitdaMargin)}</div><div class="l">EBITDA margin</div></div>
      </div>
      <div style="margin-top:10px;"><button class="btn small" data-action="schcli-apri-bilanci" data-cliente="${cliente.id}">Apri Bilanci & KPI →</button></div>
    </div>`;
  }

  const docCliente = STATE.documenti.filter(d => d.clienteId === cliente.id);
  const docScaduti = docCliente.filter(d => d.dataScadenza && giorniTra(oggiISO(), d.dataScadenza) < 0).length;
  const docInScadenza = docCliente.filter(d => d.dataScadenza && giorniTra(oggiISO(), d.dataScadenza) >= 0 && giorniTra(oggiISO(), d.dataScadenza) <= 30).length;
  const sezDoc = `<div class="card">
    <div class="section-title">Documenti <span class="cnt">${docCliente.length} totali</span></div>
    ${docCliente.length ? `<div class="helptext">${docScaduti} scaduti · ${docInScadenza} in scadenza nei prossimi 30 giorni</div>` : '<div class="empty">Nessun documento tracciato per questo cliente.</div>'}
    <div style="margin-top:10px;display:flex;gap:10px;">
      <button class="btn small" data-action="schcli-apri-documenti" data-cliente="${cliente.id}">Apri Documenti →</button>
      <button class="btn small" data-action="schcli-apri-portale" data-cliente="${cliente.id}">Anteprima Portale cliente →</button>
    </div>
  </div>`;

  const sociCliente = sociDiCliente(cliente.id);
  const sezSoci = `<div class="card">
    <div class="section-title">Soci e referenti <span class="cnt">${sociCliente.length} collegati</span></div>
    ${sociCliente.length ? sociCliente.map(s => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;" data-action="modifica-socio" data-id="${s.id}">
        <div style="flex:1;">
          <div style="font-weight:600;font-size:13px;">${escapeHtml(s.nome)}${s.ruolo?' · '+escapeHtml(s.ruolo):''}</div>
          <div class="helptext">${escapeHtml(s.email||'')}${s.email&&s.telefono?' · ':''}${escapeHtml(s.telefono||'')}${(s.clienteIds||[]).length>1?' · collegato ad altri '+((s.clienteIds.length)-1)+' clienti':''}</div>
        </div>
      </div>`).join('') : '<div class="empty">Nessun socio o referente collegato a questo cliente.</div>'}
    <div style="margin-top:10px;"><button class="btn small primary" data-action="nuovo-socio">+ Nuovo socio/referente</button></div>
  </div>`;

  const f24Cliente = (STATE.f24||[]).filter(f => f.clienteId === cliente.id).sort((a,b)=>(b.data||'').localeCompare(a.data||''));
  const sezF24 = `<div class="card">
    <div class="section-title">F24 <span class="cnt">${f24Cliente.length} registrati</span></div>
    ${f24Cliente.length ? `<table><thead><tr><th>Data</th><th>Tipo</th><th>Importo</th><th>Descrizione</th></tr></thead><tbody>${f24Cliente.slice(0,5).map(f=>`<tr><td>${fmtDataBreve(f.data)}</td><td><span class="badge ${f.tipo==='Debito'?'stato-errore':'stato-inviato-telematicamente'}">${f.tipo}</span></td><td>${fmtEuro(f.importo)}</td><td>${escapeHtml(f.descrizione||'')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nessun F24 registrato per questo cliente.</div>'}
    <div style="margin-top:10px;"><button class="btn small" data-action="nav" data-nav="f24">Apri F24 →</button></div>
  </div>`;

  return toolbar + header + sezScadenze + sezAnnuali + sezTask + sezCom + sezContab + sezBilanci + sezDoc + sezSoci + sezF24;
}

/* Adempimenti "applicabili" in anagrafica cliente: uniscono in un'unica lista, raggruppata
   per tipo (imposte dirette/indirette, contabili, ecc. — vedi TIPI_ADEMPIMENTO), sia le voci
   periodiche (checkbox data-flag, generano scadenze puntuali ogni mese/trimestre/anno) sia le
   voci annuali con avanzamento a sotto-task (checkbox data-annuale). Prima erano due fieldset
   separati e non organizzati per tipo. */
function itemsPeriodiciPerAnagrafica(cliente) {
  const custom = (STATE.catalogoPeriodico || []).filter(t => t.personalizzato && t.attivo !== false);
  const out = FLAG_SEMPLICI.map(k => ({
    tipo: tipoFlagPeriodico(k),
    checked: !!(cliente.flags && cliente.flags[k]),
    html: `<label class="checkline"><input type="checkbox" data-flag="${k}" ${cliente.flags && cliente.flags[k] ? 'checked':''}> ${escapeHtml(FLAG_LABELS[k])}</label>`,
  }));
  // Nota: "Diritto camerale" non ha più un checkbox periodico dedicato — è applicabile tramite
  // il checkbox annuale DIRITTO_CAMERALE (in itemsAnnualiPerAnagrafica), la cui scadenza viene
  // comunque calcolata dalla "data scelta dal cliente" qui sotto (SCADENZA_DINAMICA_ANNUALE).
  custom.forEach(t => out.push({
    tipo: tipoFlagPeriodico(t.flag),
    checked: !!(cliente.flags && cliente.flags[t.flag]),
    html: `<label class="checkline"><input type="checkbox" data-flag="${t.flag}" ${cliente.flags && cliente.flags[t.flag] ? 'checked':''}> ${escapeHtml(t.nome)} <span class="helptext">(personalizzata)</span></label>`,
  }));
  return out;
}
function itemsAnnualiPerAnagrafica(cliente) {
  const attive = catalogoAnnualeAttivo();
  const selezionate = annualiEffettivi(cliente);
  const extra = catalogoAnnualeTutti().filter(a => a.attivo === false && selezionate.includes(a.chiave));
  return attive.concat(extra).map(a => ({
    tipo: a.tipo || TIPO_ADEMPIMENTO_DEFAULT,
    checked: selezionate.includes(a.chiave),
    html: `<label class="checkline"><input type="checkbox" data-annuale="${a.chiave}" ${selezionate.includes(a.chiave)?'checked':''}> ${escapeHtml(a.nome)}${annualeAutomatico(cliente, a.chiave) ? ' <span class="helptext" title="Previsto in automatico dal tipo di cliente e dal regime fiscale">(auto)</span>' : ''}${a.attivo===false?' <span class="helptext">(disattivato)</span>':''}</label>`,
  }));
}
/* Adempimenti applicabili: raggruppati per categoria fiscale (TIPI_ADEMPIMENTO) e, dentro ogni
   categoria, separati in due sotto-sezioni — "Ricorrenti" (flag periodici: mensili/trimestrali)
   e "Annuali" (dichiarazioni/adempimenti con workflow a più passaggi) — perché sono due cose
   concettualmente diverse anche se condividono la stessa categoria fiscale (es. in "Imposte
   indirette" convivono la Liquidazione IVA mensile, ricorrente, e la Dichiarazione IVA annuale,
   con i suoi 7 step). Ogni categoria mostra anche un conteggio "N selezionati" per capire a
   colpo d'occhio la copertura senza dover leggere ogni singola voce. */
function renderAdempimentiApplicabili(cliente) {
  const periodici = itemsPeriodiciPerAnagrafica(cliente);
  const annuali = itemsAnnualiPerAnagrafica(cliente);
  const perTipo = new Map();
  TIPI_ADEMPIMENTO.forEach(t => perTipo.set(t, { periodici: [], annuali: [] }));
  const metti = (it, chiave) => {
    const tipo = perTipo.has(it.tipo) ? it.tipo : TIPO_ADEMPIMENTO_DEFAULT;
    perTipo.get(tipo)[chiave].push(it);
  };
  periodici.forEach(it => metti(it, 'periodici'));
  annuali.forEach(it => metti(it, 'annuali'));
  const gruppi = Array.from(perTipo.entries()).filter(([, g]) => g.periodici.length || g.annuali.length);
  const sottosezione = (titolo, items) => !items.length ? '' : `
          <div class="adm-sotto-titolo">${titolo} <span class="adm-sotto-cnt">${items.filter(i=>i.checked).length}/${items.length}</span></div>
          <div class="chk-grid">${items.map(i=>i.html).join('')}</div>`;
  return `
    <fieldset>
      <legend>Adempimenti applicabili</legend>
      <div class="helptext" style="margin:-4px 0 12px 0;">Spunta solo ciò che riguarda questo cliente: genera automaticamente le rispettive scadenze. Raggruppati per area fiscale; dentro ogni area, prima le voci ricorrenti (mensili/trimestrali) e poi quelle annuali con workflow a più passaggi.</div>
      ${gruppi.map(([tipo, g]) => {
        const tot = g.periodici.length + g.annuali.length;
        const sel = g.periodici.filter(i=>i.checked).length + g.annuali.filter(i=>i.checked).length;
        return `
        <div class="adm-gruppo">
          <div class="adm-gruppo-titolo">${escapeHtml(tipo)} <span class="adm-gruppo-cnt">${sel}/${tot} selezionati</span></div>
          ${sottosezione('Ricorrenti', g.periodici)}
          ${sottosezione('Annuali', g.annuali)}
        </div>`;
      }).join('')}
    </fieldset>
    <fieldset>
      <legend>Date specifiche per cliente</legend>
      <div class="field">
        <label>Diritto camerale — data scelta dal cliente</label>
        <select id="selDirittoCamScelta">
          <option value="">— nessuna —</option>
          ${SCELTE_DIRITTO_CAMERALE.map(s => `<option ${cliente.dirittoCameraleScelta===s?'selected':''}>${escapeHtml(s)}</option>`).join('')}
        </select>
        <div class="helptext">Usata per calcolare in automatico la scadenza dell'adempimento annuale "Diritto camerale" (sopra), se selezionato.</div>
      </div>
      <div class="field" style="margin-top:10px;">
        <label>Saldo/acconto imposte sui redditi — termine di versamento</label>
        <select id="selVersamentoImposteScelta">
          <option value="">— non applicabile —</option>
          ${SCELTE_VERSAMENTO_IMPOSTE.map(s => `<option ${cliente.versamentoImposteScelta===s?'selected':''}>${escapeHtml(s)}</option>`).join('')}
        </select>
        <div class="helptext">Genera anche "II acconto imposte sui redditi" (30/11) e, se applicabile, INPS Artig/Comm eccedente e INPS Gestione Separata alla stessa data.</div>
      </div>
    </fieldset>`;
}

/* Campo del form anagrafica -> etichetta usata da livelliMancantiCliente (per colorare le caselle). */
const CAMPI_FORM_MANCANTI = {
  'Regime fiscale': ['fRegime'], 'Periodicità IVA': ['fPeriodIva'], 'Responsabile studio': ['fResponsabile'],
  'Tenuta contabilità': ['fContabilita'], 'Addebito F24': ['fAddebito'], 'Previdenza': ['fPrevidenza'],
  'Codice fiscale / P.IVA': ['fCodiceFiscale', 'fPartitaIva'], 'PMI innovativa (sì/no)': ['fPmiInnovativa'],
  'Start-up innovativa (sì/no)': ['fStartupInnovativa'], 'Organo di controllo': ['fOrganoControllo'],
  'Email o PEC': ['fEmail', 'fPec'], 'Codice ATECO': ['fAteco'], 'Iscrizione Registro Imprese': ['fIscrittoRI'],
};
function htmlBannerMancantiCliente(l) {
  if (!l.gravi.length && !l.leggeri.length) return '';
  const g = l.gravi.length > 0;
  return `<div style="margin:8px 0;padding:8px 10px;border-left:4px solid ${g?'var(--rosso)':'var(--giallo)'};background:${g?'var(--rosso-bg)':'var(--giallo-bg)'};border-radius:6px;font-size:13px;">${l.gravi.length ? `⚠ Importanti (caselle rosse): <strong>${l.gravi.map(escapeHtml).join(', ')}</strong>` : ''}${l.gravi.length && l.leggeri.length ? '<br>' : ''}${l.leggeri.length ? `ℹ Utili (caselle gialle): ${l.leggeri.map(escapeHtml).join(', ')}` : ''}</div>`;
}
/* Ricalcola i dati mancanti dal contenuto ATTUALE del form e colora le caselle: rosso = importante,
   giallo = utile. Si aggiorna mentre si compila, così si vede subito cosa resta da fare. */
function evidenziaCampiMancantiForm() {
  const form = document.getElementById('formCliente');
  if (!form) return;
  let l;
  try { l = livelliMancantiCliente(leggiFormCliente(form.dataset.id, !!clienteById(form.dataset.id)).cliente); } catch (err) { return; }
  Object.values(CAMPI_FORM_MANCANTI).flat().forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('mancante-grave', 'mancante-leggero');
  });
  const applica = (lista, cls) => lista.forEach(k => (CAMPI_FORM_MANCANTI[k] || []).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add(cls);
  }));
  applica(l.leggeri, 'mancante-leggero');
  applica(l.gravi, 'mancante-grave'); // il rosso prevale se un campo è in entrambe
  const banner = document.getElementById('bannerMancantiCliente');
  if (banner) banner.innerHTML = htmlBannerMancantiCliente(l);
}
function modalCliente(clienteId) {
  const editing = !!clienteId;
  const c = editing ? clienteById(clienteId) : {
    id: uid('cli'), tipo: 'societa_capitali', ragioneSociale: '', codiceFiscale: '', partitaIva: '', atecoCodici: [], naturaGiuridica: '',
    regimeFiscale: 'Ordinario', contatti: { pec: '' }, responsabileStudio: STATE.meta.responsabili[0] || '',
    addebitoF24: 'NOI', contabilita: 'ESTERNA', stato: 'attivo',
    periodicitaIva: 'Mensile', periodicitaIntrastat: 'N.A.', previdenza: 'No previdenza',
    flags: {}, dirittoCameraleScelta: null, versamentoImposteScelta: SCELTE_VERSAMENTO_IMPOSTE[1], adempimentiAnnualiApplicabili: [], note: '',
    settore: '', annoIngresso: new Date().getFullYear(), canaleAcquisizione: '', mandatario: '', preventivoAnnuo: '',
    pmiInnovativa: '', startupInnovativa: '', organoControllo: '', iscrittoRegistroImprese: '', haDipendenti: '', dataCostituzione: '',
  };
  const contatti = c.contatti || {};
  const vuoto = (v) => `<option value="" ${!v?'selected':''}>— da indicare —</option>`;

  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>${editing?'Modifica cliente':'Nuovo cliente'}</h2><div class="modal-sub">Compila i dati anagrafici e i flag fiscali: generano automaticamente le scadenze.</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>

      <div id="bannerMancantiCliente">${htmlBannerMancantiCliente(editing ? livelliMancantiCliente(c) : { gravi: [], leggeri: [] })}</div>
      <form id="formCliente" data-id="${c.id}" onsubmit="return false;">
        <fieldset>
          <legend>Dati identificativi</legend>
          <div class="grid3">
            <div class="field"><label>Tipo</label><select id="fTipo" data-action="cli-tipo-cambia">${TIPI_CLIENTE.map(t=>`<option value="${t.v}" ${c.tipo===t.v?'selected':''}>${t.l}</option>`).join('')}</select></div>
            <div class="field full" style="grid-column:span 2;"><label>Ragione sociale / Nome *</label><input id="fRagioneSociale" required value="${escapeHtml(c.ragioneSociale)}"></div>
            <div class="field"><label>Codice fiscale</label><input id="fCodiceFiscale" value="${escapeHtml(c.codiceFiscale)}"></div>
            <div class="field"><label>Partita IVA</label><input id="fPartitaIva" value="${escapeHtml(c.partitaIva)}"></div>
            <div class="field" style="grid-column:span 2;"><label>Codici ATECO</label><input id="fAteco" value="${escapeHtml((c.atecoCodici||[]).join(', '))}" placeholder="es. 62.01.00, 47.91.10"><div class="helptext" style="margin-top:4px;">Più codici separati da virgola, se il cliente svolge più attività.</div></div>
            <div class="field"><label>Attività / Settore</label><input id="fSettore" value="${escapeHtml(c.settore||'')}" placeholder="es. Impiantistica elettrica"></div>
            <div class="field"><label>Anno ingresso in studio</label><input type="number" id="fAnnoIngresso" value="${escapeHtml(c.annoIngresso||'')}"></div>
            <div class="field"><label>Canale di acquisizione</label><input id="fCanale" value="${escapeHtml(c.canaleAcquisizione||'')}" placeholder="es. Passaparola, sito web..."></div>
            <div class="field"><label>Mandatario</label><input id="fMandatario" list="dlMandatari" value="${escapeHtml(c.mandatario||'')}" placeholder="es. Studio, Dott. Rossi"><datalist id="dlMandatari">${mandatariEsistenti().map(m=>`<option value="${escapeHtml(m)}">`).join('')}</datalist><div class="helptext" style="margin-top:4px;">Chi ha il mandato con il cliente (utile con più professionisti).</div></div>
            <div class="field"><label>Capitale sociale (€)</label><input type="number" step="0.01" id="fCapitaleSociale" value="${c.capitaleSociale!=null?escapeHtml(c.capitaleSociale):''}" placeholder="es. 10000"></div>
            <div class="field"><label>Sedi secondarie (oltre alla legale)</label><input type="number" step="1" min="0" id="fNumeroSedi" value="${c.numeroSedi!=null?escapeHtml(c.numeroSedi):'0'}"></div>
            <div class="field" style="grid-column:span 1;"><div class="helptext" style="margin-top:20px;">Usati per precompilare gli importi statutari (diritto camerale, vidimazione libri) in Impostazioni.</div></div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Contatti</legend>
          <div class="grid3">
            <div class="field"><label>Email principale</label><input id="fEmail" value="${escapeHtml(contatti.email||'')}"></div>
            <div class="field"><label>Email amministrazione</label><input id="fEmailAmm" value="${escapeHtml(contatti.emailAmministrazione||'')}"></div>
            <div class="field"><label>PEC</label><input id="fPec" value="${escapeHtml(contatti.pec||'')}"></div>
            <div class="field"><label>Telefono</label><input id="fTelefono" value="${escapeHtml(contatti.telefono||'')}"></div>
            <div class="field"><label>Indirizzo</label><input id="fIndirizzo" value="${escapeHtml(contatti.indirizzo||'')}"></div>
            <div class="field"><label>CAP</label><input id="fCap" value="${escapeHtml(contatti.cap||'')}"></div>
            <div class="field"><label>Località</label><input id="fLocalita" value="${escapeHtml(contatti.localita||'')}"></div>
            <div class="field"><label>Provincia</label><input id="fProvincia" value="${escapeHtml(contatti.provincia||'')}" maxlength="2" style="max-width:70px;"></div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Valore cliente per lo studio</legend>
          <div class="grid3">
            <div class="field"><label>Preventivo annuo (€)</label><input type="number" step="0.01" id="fPreventivo" value="${escapeHtml(c.preventivoAnnuo||'')}"></div>
            <div class="field"><label>Tipo di rapporto</label><select id="fTipoRapporto">${TIPI_RAPPORTO.map(t=>`<option ${(c.tipoRapporto||TIPI_RAPPORTO[0])===t?'selected':''}>${t}</option>`).join('')}</select></div>
            <div class="field"><label>Fatturazione dei compensi</label><select id="fFatturazione"><option value="">— non indicata —</option>${PERIODICITA_FATTURAZIONE.map(t=>`<option ${c.fatturazione===t?'selected':''}>${t}</option>`).join('')}</select></div>
            <div class="field"><label>Data ingresso</label><input type="date" id="fDataIngresso" value="${escapeHtml(c.dataIngresso||'')}"></div>
            <div class="field"><label>Data cessazione</label><input type="date" id="fDataCessazione" value="${escapeHtml(c.dataCessazione||'')}"></div>
            <div class="field"><label>Motivo cessazione</label><select id="fMotivoCessazione"><option value="">—</option>${MOTIVI_CESSAZIONE.map(t=>`<option ${c.motivoCessazione===t?'selected':''}>${escapeHtml(t)}</option>`).join('')}</select></div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Regime e gestione</legend>
          <div class="grid3">
            <div class="field"><label>Regime fiscale</label><select id="fRegime">${vuoto(c.regimeFiscale)}${REGIMI_FISCALI.map(r=>`<option ${c.regimeFiscale===r?'selected':''}>${r}</option>`).join('')}</select></div>
            <div class="field"><label>Responsabile studio</label><select id="fResponsabile">${vuoto(c.responsabileStudio)}${STATE.meta.responsabili.map(r=>`<option ${c.responsabileStudio===r?'selected':''}>${escapeHtml(r)}</option>`).join('')}</select></div>
            <div class="field"><label>Iscritto al Registro Imprese</label><select id="fIscrittoRI">${vuoto(c.iscrittoRegistroImprese)}<option value="SI" ${c.iscrittoRegistroImprese==='SI'?'selected':''}>Sì (dovuto il diritto camerale)</option><option value="NO" ${c.iscrittoRegistroImprese==='NO'?'selected':''}>No</option></select><div class="helptext" style="margin-top:4px;">Le società sono sempre iscritte; serve per le ditte individuali.</div></div>
            <div class="field"><label>Stato cliente</label><select id="fStato"><option value="attivo" ${c.stato==='attivo'?'selected':''}>Attivo</option><option value="cessato" ${c.stato==='cessato'?'selected':''}>Cessato</option><option value="potenziale" ${c.stato==='potenziale'?'selected':''}>Potenziale (solo preventivo)</option></select></div>
            <div class="field"><label>Addebito F24</label><select id="fAddebito">${vuoto(c.addebitoF24)}${SCELTE_ADDEBITO_F24.map(o=>`<option value="${o.v}" ${c.addebitoF24===o.v?'selected':''}>${o.l}</option>`).join('')}</select></div>
            <div class="field"><label>Tenuta contabilità</label><select id="fContabilita">${vuoto(c.contabilita)}${SCELTE_CONTABILITA.map(o=>`<option value="${o.v}" ${c.contabilita===o.v?'selected':''}>${o.l}</option>`).join('')}</select></div>
            <div class="field"><label>Ha dipendenti</label><select id="fHaDipendenti">${vuoto(c.haDipendenti)}<option value="SI" ${c.haDipendenti==='SI'?'selected':''}>Sì, ha dipendenti</option><option value="NO" ${c.haDipendenti==='NO'?'selected':''}>No, nessun dipendente</option></select></div>
          </div>
        </fieldset>

        <fieldset>
          <legend>PMI e start-up innovative (se hanno il requisito)</legend>
          <div class="grid3">
            <div class="field"><label>PMI innovativa</label><select id="fPmiInnovativa">${vuoto(c.pmiInnovativa)}<option value="SI" ${c.pmiInnovativa==='SI'?'selected':''}>Sì, ha il requisito</option><option value="NO" ${c.pmiInnovativa==='NO'?'selected':''}>No</option></select></div>
            <div class="field"><label>Start-up innovativa</label><select id="fStartupInnovativa">${vuoto(c.startupInnovativa)}<option value="SI" ${c.startupInnovativa==='SI'?'selected':''}>Sì, ha il requisito</option><option value="NO" ${c.startupInnovativa==='NO'?'selected':''}>No</option></select></div>
          </div>
          <div class="helptext">Richiesti per le società (di capitali, cooperative, imprese sociali). Finché non sono indicati il cliente resta "da completare".</div>
        </fieldset>

        <fieldset id="fsAssociazione" style="${c.tipo === 'associazione' ? '' : 'display:none;'}">
          <legend>Dati dell'associazione</legend>
          ${(() => { const a = datiAssociazione(c); const sel = (id, lista, val) => `<select id="${id}"><option value="">—</option>${lista.map(o => `<option ${val === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`; return `<div class="grid3">
            <div class="field"><label>Qualifica dell'ente</label><input id="fAssQualifica" value="${escapeHtml(a.qualifica)}" placeholder="es. APS, ETS, ASD"></div>
            <div class="field"><label>Personalità giuridica</label>${sel('fAssPersonalita', ASSOC_PERSONALITA, a.personalita)}</div>
            <div class="field"><label>Iscrizione al RUNTS</label>${sel('fAssRunts', ASSOC_RUNTS, a.runts)}</div>
            <div class="field"><label>Sezione RUNTS</label><input id="fAssSezione" value="${escapeHtml(a.sezioneRunts)}" placeholder="es. APS, Altri ETS"></div>
            <div class="field"><label>Numero di repertorio RUNTS</label><input id="fAssRepertorio" value="${escapeHtml(a.repertorioRunts)}"></div>
            <div class="field"><label>Delega RUNTS allo studio</label>${sel('fAssDelega', ASSOC_DELEGA, a.delegaRunts)}</div>
            <div class="field"><label>Registro sportivo (RASD)</label>${sel('fAssRasd', ASSOC_RASD, a.rasd)}</div>
            <div class="field" style="grid-column:1/-1;"><label>Cosa fare adesso / documenti da recuperare</label><textarea id="fAssDaFare" rows="3" style="width:100%;">${escapeHtml(a.daFare)}</textarea></div>
          </div>`; })()}
          <div class="helptext">Compare solo per le associazioni. La delega RUNTS serve per operare sul registro per conto dell'ente.</div>
        </fieldset>

        <fieldset>
          <legend>Organo di controllo</legend>
          <div class="grid3">
            <div class="field"><label>Data di costituzione</label><input type="date" id="fDataCostituzione" value="${escapeHtml(c.dataCostituzione || '')}"></div>
            <div class="field"><label>Organo di controllo</label><select id="fOrganoControllo">${vuoto(c.organoControllo)}${OPZIONI_ORGANO_CONTROLLO.map(o=>`<option ${c.organoControllo===o?'selected':''}>${o}</option>`).join('')}</select></div>
          </div>
          <div class="helptext">Vale per qualunque società, anche se non è PMI o start-up innovativa: serve ad esempio per il quadro del 770. Finché non è indicato il cliente resta "da completare".</div>
        </fieldset>

        <fieldset>
          <legend>Periodicità e previdenza (pilotano le scadenze automatiche)</legend>
          <div class="grid3">
            <div class="field"><label>Periodicità IVA</label><select id="fPeriodIva">${vuoto(c.periodicitaIva)}<option ${c.periodicitaIva==='Mensile'?'selected':''}>Mensile</option><option ${c.periodicitaIva==='Trimestrale'?'selected':''}>Trimestrale</option><option ${c.periodicitaIva==='N.A.'?'selected':''}>N.A.</option></select></div>
            <div class="field"><label>Periodicità Intrastat</label><select id="fPeriodIntrastat"><option ${c.periodicitaIntrastat==='Mensile'?'selected':''}>Mensile</option><option ${c.periodicitaIntrastat==='Trimestrale'?'selected':''}>Trimestrale</option><option ${c.periodicitaIntrastat==='N.A.'?'selected':''}>N.A.</option></select></div>
            <div class="field"><label>Previdenza</label><select id="fPrevidenza">
              ${vuoto(c.previdenza)}${PREVIDENZE.map(p=>`<option ${c.previdenza===p?'selected':''}>${p}</option>`).join('')}
            </select></div>
          </div>
        </fieldset>

        ${renderAdempimentiApplicabili(c)}

        <fieldset>
          <legend>Note</legend>
          <textarea id="fNote" class="full" style="width:100%;min-height:60px;" >${escapeHtml(c.note||'')}</textarea>
        </fieldset>
      </form>

      <div class="modal-actions">
        ${editing ? `<button class="btn danger" data-action="elimina-cliente" data-id="${c.id}" style="margin-right:auto;">Elimina cliente</button>` : ''}
        <button class="btn" data-action="chiudi-modal">Annulla</button>
        <button class="btn primary" data-action="salva-cliente" data-id="${c.id}" data-editing="${editing?'1':'0'}">Salva</button>
      </div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
  // I contatori "N/M selezionati" per gruppo/sotto-sezione sono calcolati solo al render del
  // modale: senza questo listener resterebbero fermi allo stato di apertura mentre l'utente
  // spunta/togli le voci, mostrando numeri sbagliati fino al prossimo salvataggio. Aggiorna solo
  // il testo dei contatori coinvolti, senza toccare il resto del DOM (niente perdita di focus).
  const formEl = document.getElementById('formCliente');
  if (formEl) formEl.addEventListener('change', e => {
    if (e.target.matches('[data-flag], [data-annuale]')) aggiornaContatoriAdempimenti(formEl);
  });
  if (formEl) {
    formEl.addEventListener('input', evidenziaCampiMancantiForm);
    formEl.addEventListener('change', evidenziaCampiMancantiForm);
    formEl.addEventListener('change', e => {
      if (e.target.matches('[data-annuale]')) { e.target.dataset.toccato = '1'; return; }
      if (!e.target.matches('#fTipo, #fRegime')) return;
      try {
        const cli = leggiFormCliente(formEl.dataset.id, !!clienteById(formEl.dataset.id)).cliente;
        formEl.querySelectorAll('[data-annuale]').forEach(inp => {
          if (inp.dataset.toccato) return;
          inp.checked = annualeAutomatico(cli, inp.dataset.annuale) || (clienteById(formEl.dataset.id)?.adempimentiAnnualiApplicabili || []).includes(inp.dataset.annuale);
        });
        aggiornaContatoriAdempimenti(formEl);
      } catch (err) { /* form incompleto: ignora */ }
    });
    evidenziaCampiMancantiForm();
  }
}
function aggiornaContatoriAdempimenti(root) {
  root.querySelectorAll('.adm-gruppo').forEach(gruppo => {
    let selTot = 0, tot = 0;
    gruppo.querySelectorAll('.adm-sotto-titolo').forEach(titolo => {
      const wrap = titolo.nextElementSibling;
      const boxes = wrap ? wrap.querySelectorAll('input[type="checkbox"]') : [];
      const sel = Array.from(boxes).filter(b => b.checked).length;
      const cntEl = titolo.querySelector('.adm-sotto-cnt');
      if (cntEl) cntEl.textContent = `${sel}/${boxes.length}`;
      selTot += sel; tot += boxes.length;
    });
    const gruppoCnt = gruppo.querySelector('.adm-gruppo-cnt');
    if (gruppoCnt) gruppoCnt.textContent = `${selTot}/${tot} selezionati`;
  });
}

function leggiFormCliente(id, editing) {
  const form = document.getElementById('formCliente');
  const flags = {};
  form.querySelectorAll('[data-flag]').forEach(inp => { flags[inp.dataset.flag] = inp.checked; });
  const annuali = [];
  const annualiCheck = [];
  form.querySelectorAll('[data-annuale]').forEach(inp => { annualiCheck.push({ k: inp.dataset.annuale, on: inp.checked }); });
  const dirittoScelta = document.getElementById('selDirittoCamScelta').value || null;
  const versamentoScelta = document.getElementById('selVersamentoImposteScelta').value || null;
  const ragioneSociale = document.getElementById('fRagioneSociale').value.trim();
  const cliente = {
    id,
    tipo: document.getElementById('fTipo').value,
    ragioneSociale,
    codiceFiscale: document.getElementById('fCodiceFiscale').value.trim(),
    partitaIva: document.getElementById('fPartitaIva').value.trim(),
    atecoCodici: Array.from(new Set(document.getElementById('fAteco').value.split(',').map(s => s.trim()).filter(Boolean))),
    settore: document.getElementById('fSettore').value.trim(),
    annoIngresso: document.getElementById('fAnnoIngresso').value ? Number(document.getElementById('fAnnoIngresso').value) : null,
    canaleAcquisizione: document.getElementById('fCanale').value.trim(),
    mandatario: (document.getElementById('fMandatario') || { value: '' }).value.trim(),
    capitaleSociale: document.getElementById('fCapitaleSociale').value !== '' ? Number(document.getElementById('fCapitaleSociale').value) : null,
    numeroSedi: document.getElementById('fNumeroSedi').value !== '' ? Number(document.getElementById('fNumeroSedi').value) : 0,
    preventivoAnnuo: document.getElementById('fPreventivo').value ? Number(document.getElementById('fPreventivo').value) : null,
    regimeFiscale: document.getElementById('fRegime').value,
    pmiInnovativa: document.getElementById('fPmiInnovativa').value,
    startupInnovativa: document.getElementById('fStartupInnovativa').value,
    haDipendenti: (document.getElementById('fHaDipendenti') || {}).value || '',
    dataCostituzione: (document.getElementById('fDataCostituzione') || {}).value || '',
    organoControllo: document.getElementById('fOrganoControllo').value,
    iscrittoRegistroImprese: document.getElementById('fIscrittoRI').value,
    associazione: document.getElementById('fTipo').value === 'associazione' && document.getElementById('fAssRunts')
      ? { qualifica: document.getElementById('fAssQualifica').value.trim(), personalita: document.getElementById('fAssPersonalita').value, runts: document.getElementById('fAssRunts').value, sezioneRunts: document.getElementById('fAssSezione').value.trim(), repertorioRunts: document.getElementById('fAssRepertorio').value.trim(), delegaRunts: document.getElementById('fAssDelega').value, rasd: document.getElementById('fAssRasd').value, daFare: document.getElementById('fAssDaFare').value.trim() }
      : (editing && clienteById(id) ? clienteById(id).associazione : undefined),
    contatti: {
      email: document.getElementById('fEmail').value.trim(),
      emailAmministrazione: document.getElementById('fEmailAmm').value.trim(),
      pec: document.getElementById('fPec').value.trim(),
      telefono: document.getElementById('fTelefono').value.trim(),
      indirizzo: document.getElementById('fIndirizzo').value.trim(),
      cap: document.getElementById('fCap').value.trim(),
      localita: document.getElementById('fLocalita').value.trim(),
      provincia: document.getElementById('fProvincia').value.trim().toUpperCase(),
    },
    responsabileStudio: document.getElementById('fResponsabile').value,
    stato: document.getElementById('fStato').value,
    addebitoF24: document.getElementById('fAddebito').value,
    contabilita: document.getElementById('fContabilita').value,
    periodicitaIva: document.getElementById('fPeriodIva').value,
    periodicitaIntrastat: document.getElementById('fPeriodIntrastat').value,
    previdenza: document.getElementById('fPrevidenza').value,
    flags,
    dirittoCameraleScelta: dirittoScelta,
    versamentoImposteScelta: versamentoScelta,
    adempimentiAnnualiApplicabili: [],
    adempimentiAnnualiEsclusi: [],
    note: document.getElementById('fNote').value,
    tipoRapporto: document.getElementById('fTipoRapporto').value,
    fatturazione: document.getElementById('fFatturazione').value,
    dataIngresso: document.getElementById('fDataIngresso').value || '',
    dataCessazione: document.getElementById('fDataCessazione').value || '',
    motivoCessazione: document.getElementById('fMotivoCessazione').value || '',
    creatoIl: editing ? (clienteById(id)?.creatoIl || oggiISO()) : oggiISO(),
  };
  annualiCheck.forEach(({ k, on }) => {
    const auto = annualeAutomatico(cliente, k);
    if (on && !auto) cliente.adempimentiAnnualiApplicabili.push(k);
    if (!on && auto) cliente.adempimentiAnnualiEsclusi.push(k);
  });
  return { cliente, valido: !!ragioneSociale };
}

/* -------------------- IMPORT/EXPORT CLIENTI DA EXCEL/CSV --------------------
   Permette di caricare tanti clienti in un colpo solo (es. all'avvio, o dopo aver esportato
   l'anagrafica da un altro gestionale) invece di crearli uno per uno dal form. Il template
   scaricabile ha una seconda scheda con i valori ammessi per ogni colonna, così chi lo compila
   sa esattamente cosa scrivere. In import, i valori non riconosciuti non bloccano la riga: viene
   usato un default sensato e l'utente viene avvisato a fine importazione, così non si perde mai
   una riga per un piccolo errore di battitura. */
const COLONNE_IMPORT_CLIENTI = [
  { intestazione: 'Tipo', chiave: 'tipo' },
  { intestazione: 'Ragione sociale / Nome', chiave: 'ragioneSociale' },
  { intestazione: 'Codice fiscale', chiave: 'codiceFiscale' },
  { intestazione: 'Partita IVA', chiave: 'partitaIva' },
  { intestazione: 'Regime fiscale', chiave: 'regimeFiscale' },
  { intestazione: 'Periodicità IVA', chiave: 'periodicitaIva' },
  { intestazione: 'Responsabile studio', chiave: 'responsabileStudio' },
  { intestazione: 'Tenuta contabilità', chiave: 'contabilita' },
  { intestazione: 'Addebito F24', chiave: 'addebitoF24' },
  { intestazione: 'Previdenza', chiave: 'previdenza' },
  { intestazione: 'Email', chiave: 'email' },
  { intestazione: 'PEC', chiave: 'pec' },
  { intestazione: 'Telefono', chiave: 'telefono' },
  { intestazione: 'Indirizzo', chiave: 'indirizzo' },
  { intestazione: 'CAP', chiave: 'cap' },
  { intestazione: 'Località', chiave: 'localita' },
  { intestazione: 'Provincia', chiave: 'provincia' },
  { intestazione: 'Attività / Settore', chiave: 'settore' },
  { intestazione: 'Codici ATECO', chiave: 'ateco' },
  { intestazione: 'PMI innovativa', chiave: 'pmiInnovativa' },
  { intestazione: 'Start-up innovativa', chiave: 'startupInnovativa' },
  { intestazione: 'Organo di controllo', chiave: 'organoControllo' },
  { intestazione: 'Ha dipendenti', chiave: 'haDipendenti' },
  { intestazione: 'Iscritto Registro Imprese', chiave: 'iscrittoRegistroImprese' },
  { intestazione: 'Mandatario', chiave: 'mandatario' },
  { intestazione: 'Anno ingresso', chiave: 'annoIngresso' },
  { intestazione: 'Preventivo annuo (€)', chiave: 'preventivoAnnuo' },
  { intestazione: 'Canale di acquisizione', chiave: 'canaleAcquisizione' },
  { intestazione: 'Note', chiave: 'note' },
];

function trovaColonnaImport(headerRow, intestazioneAttesa) {
  const norm = s => String(s || '').trim().toLowerCase();
  const target = norm(intestazioneAttesa);
  return (headerRow || []).findIndex(h => norm(h) === target);
}
/* Import guidato (task #211): oltre al nostro template si riconoscono le intestazioni più comuni
   degli export di altri gestionali (Denominazione, P.IVA, Cod. fiscale, Comune, Prov...). */
const SINONIMI_IMPORT_CLIENTI = {
  ragioneSociale: ['denominazione', 'ragione sociale', 'nominativo', 'cognome nome', 'nome cognome', 'cliente', 'anagrafica', 'ditta', 'intestazione', 'nome'],
  codiceFiscale: ['codice fiscale', 'cod fiscale', 'cod fisc', 'cf', 'c f'],
  partitaIva: ['partita iva', 'p iva', 'piva', 'part iva', 'partita i v a'],
  email: ['email', 'e mail', 'mail', 'posta elettronica'],
  pec: ['pec', 'posta certificata', 'email pec'],
  telefono: ['telefono', 'tel', 'cellulare', 'cell', 'recapito telefonico'],
  indirizzo: ['indirizzo', 'via', 'sede legale', 'residenza', 'indirizzo sede'],
  cap: ['cap', 'c a p'],
  localita: ['localita', 'comune', 'citta', 'comune sede'],
  provincia: ['provincia', 'prov', 'pr'],
  settore: ['attivita', 'settore', 'descrizione attivita'],
  ateco: ['ateco', 'codice ateco', 'codici ateco', 'cod ateco'],
  note: ['note', 'annotazioni', 'osservazioni'],
  mandatario: ['mandatario', 'intestatario mandato'],
  pmiInnovativa: ['pmi innovativa', 'pmi'],
  startupInnovativa: ['start up innovativa', 'startup innovativa', 'startup'],
  organoControllo: ['organo di controllo', 'organo controllo', 'sindaco revisore'],
  haDipendenti: ['ha dipendenti', 'dipendenti', 'con dipendenti'],
  iscrittoRegistroImprese: ['iscritto registro imprese', 'registro imprese', 'iscritto rea', 'iscrizione registro imprese'],
  annoIngresso: ['anno ingresso', 'anno di ingresso', 'cliente dal'],
  preventivoAnnuo: ['preventivo annuo', 'preventivo annuale', 'compenso annuo', 'preventivo annuo eur'],
  canaleAcquisizione: ['canale di acquisizione', 'canale acquisizione', 'provenienza'],
  tipo: ['tipo', 'tipologia', 'forma giuridica', 'natura giuridica', 'tipo soggetto'],
  regimeFiscale: ['regime fiscale', 'regime', 'regime contabile'],
  periodicitaIva: ['periodicita iva', 'liquidazione iva', 'periodicita'],
  responsabileStudio: ['responsabile studio', 'responsabile', 'referente studio'],
  contabilita: ['tenuta contabilita', 'contabilita'],
  addebitoF24: ['addebito f24'],
  previdenza: ['previdenza', 'gestione previdenziale'],
};
function normIntestazioneImport(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
/* Assegna a ogni campo Prisma la colonna del file più probabile (intestazione esatta del nostro
   template, poi sinonimi): una colonna non viene usata per due campi. Ritorna {chiave: indice|-1}. */
function mappaturaAutomaticaImportClienti(header) {
  const usate = new Set();
  const mappa = {};
  const norm = (header || []).map(normIntestazioneImport);
  COLONNE_IMPORT_CLIENTI.forEach(c => {
    let idx = trovaColonnaImport(header, c.intestazione);
    if (idx === -1 || usate.has(idx)) {
      idx = -1;
      for (const sin of (SINONIMI_IMPORT_CLIENTI[c.chiave] || [])) {
        const i = norm.findIndex((h, k) => !usate.has(k) && h === sin);
        if (i !== -1) { idx = i; break; }
      }
    }
    if (idx !== -1) usate.add(idx);
    mappa[c.chiave] = idx;
  });
  return mappa;
}

async function scaricaTemplateClienti() {
  const esempio = {
    tipo: labelTipoCliente('societa_capitali'), ragioneSociale: 'Esempio Impianti SRL',
    codiceFiscale: '01234567890', partitaIva: '01234567890', regimeFiscale: 'Ordinario',
    periodicitaIva: 'Mensile', responsabileStudio: STATE.meta.responsabili[0] || 'Matteo',
    contabilita: (SCELTE_CONTABILITA.find(o => o.v === 'ESTERNA') || {}).l || 'Esterna',
    addebitoF24: (SCELTE_ADDEBITO_F24.find(o => o.v === 'NOI') || {}).l || 'Noi (studio)',
    previdenza: 'No previdenza', pmiInnovativa: 'No', startupInnovativa: 'No', organoControllo: 'Nessuno', email: 'info@esempio.it', pec: 'esempioimpianti@pec.it',
    telefono: '0444 123456', indirizzo: 'Via Roma 1', cap: '36100', localita: 'Vicenza', provincia: 'VI',
    settore: 'Impiantistica elettrica', ateco: '43.21.01', mandatario: 'Quadra', annoIngresso: '2019', preventivoAnnuo: '3000', canaleAcquisizione: 'Contatto diretto', note: 'Riga di esempio: cancellala prima di importare',
  };
  const header = COLONNE_IMPORT_CLIENTI.map(c => c.intestazione);
  const rigaEsempio = COLONNE_IMPORT_CLIENTI.map(c => esempio[c.chiave] || '');
  const righeValoriAmmessi = [
    ['Colonna', 'Valori ammessi'],
    ['Tipo', TIPI_CLIENTE.map(t => t.l).join(' | ')],
    ['Regime fiscale', REGIMI_FISCALI.join(' | ')],
    ['Periodicità IVA', 'Mensile | Trimestrale | N.A.'],
    ['Responsabile studio', STATE.meta.responsabili.join(' | ')],
    ['Tenuta contabilità', SCELTE_CONTABILITA.map(o => o.l).join(' | ')],
    ['Addebito F24', SCELTE_ADDEBITO_F24.map(o => o.l).join(' | ')],
    ['Previdenza', PREVIDENZE.join(' | ')],
    ['PMI innovativa / Start-up innovativa / Iscritto Registro Imprese / Ha dipendenti', 'Sì | No'],
    ['Organo di controllo', OPZIONI_ORGANO_CONTROLLO.join(' | ')],
    ['', ''],
    ['Nota', 'Le celle vuote o con valore non riconosciuto NON vengono sostituite da un default: il campo resta vuoto e il cliente risulta "da completare" finché non lo compili. Le colonne non riconosciute vengono ignorate. Partita IVA e Codice fiscale servono anche a evitare di importare due volte lo stesso cliente.'],
  ];

  if (typeof XLSX !== 'undefined') {
    try {
      const wb = XLSX.utils.book_new();
      const wsClienti = XLSX.utils.aoa_to_sheet([header, rigaEsempio]);
      wsClienti['!cols'] = header.map(() => ({ wch: 22 }));
      XLSX.utils.book_append_sheet(wb, wsClienti, 'Clienti da importare');
      const wsValori = XLSX.utils.aoa_to_sheet(righeValoriAmmessi);
      wsValori['!cols'] = [{ wch: 20 }, { wch: 70 }];
      XLSX.utils.book_append_sheet(wb, wsValori, 'Valori ammessi');
      const arr = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const ok = await salvaFileScaricabile('template-clienti.xlsx', blob);
      if (ok) toast('Template Excel scaricato.');
      return;
    } catch (err) {
      console.error('Generazione template Excel non riuscita, provo il CSV', err);
    }
  }
  // Libreria Excel non disponibile (es. offline al primo caricamento): il CSV funziona comunque.
  const righeCsv = [header, rigaEsempio];
  const csv = righeCsv.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const ok = await salvaFileScaricabile('template-clienti.csv', '﻿' + csv);
  if (ok) toast('Template scaricato in CSV (l\'Excel non era disponibile in questo momento).');
}

/* Converte una singola riga del file importato in un oggetto cliente completo, con lo stesso
   shape usato da leggiFormCliente(). Non blocca mai per un valore fuori enum: usa un default
   sensato e restituisce un avviso testuale, così l'utente può correggere con calma dopo. */
function clienteDaRigaImport(valori, numeroRigaFile) {
  const warnings = [];
  const get = chiave => {
    const col = COLONNE_IMPORT_CLIENTI.find(c => c.chiave === chiave);
    const idx = col ? col.idx : -1;
    return (idx != null && idx >= 0 && valori[idx] != null) ? String(valori[idx]).trim() : '';
  };

  const ragioneSociale = get('ragioneSociale');
  if (!ragioneSociale) return { cliente: null, warnings: [`Riga ${numeroRigaFile}: manca la ragione sociale/nome, riga saltata.`] };
  const ctx = `Riga ${numeroRigaFile} (${ragioneSociale})`;

  let tipo = 'societa_capitali';
  const tipoInserito = get('tipo');
  if (tipoInserito) {
    const match = TIPI_CLIENTE.find(t => t.l.toLowerCase() === tipoInserito.toLowerCase() || t.v.toLowerCase() === tipoInserito.toLowerCase());
    if (match) tipo = match.v; else warnings.push(`${ctx}: tipo "${tipoInserito}" non riconosciuto, impostato "${labelTipoCliente('societa_capitali')}" di default.`);
  }

  let regimeFiscale = '';
  const regimeInserito = get('regimeFiscale');
  if (regimeInserito) {
    const match = REGIMI_FISCALI.find(r => r.toLowerCase() === regimeInserito.toLowerCase());
    if (match) regimeFiscale = match; else warnings.push(`${ctx}: regime fiscale "${regimeInserito}" non riconosciuto, lasciato vuoto (da completare).`);
  }

  let periodicitaIva = '';
  const periodInserito = get('periodicitaIva');
  if (/^mensile$/i.test(periodInserito)) periodicitaIva = 'Mensile';
  else if (/^trimestrale$/i.test(periodInserito)) periodicitaIva = 'Trimestrale';
  else if (/^n\.?a\.?$/i.test(periodInserito)) periodicitaIva = 'N.A.';
  else if (periodInserito) warnings.push(`${ctx}: periodicità IVA "${periodInserito}" non riconosciuta, lasciata vuota (da completare).`);

  let responsabileStudio = '';
  const respInserito = get('responsabileStudio');
  if (respInserito) {
    const match = STATE.meta.responsabili.find(r => r.toLowerCase() === respInserito.toLowerCase());
    if (match) responsabileStudio = match; else warnings.push(`${ctx}: responsabile "${respInserito}" non riconosciuto, lasciato vuoto (da completare).`);
  }

  let contabilita = '';
  const contabInserito = get('contabilita');
  if (contabInserito) {
    const match = SCELTE_CONTABILITA.find(o => o.l.toLowerCase() === contabInserito.toLowerCase() || o.v.toLowerCase() === contabInserito.toLowerCase());
    if (match) contabilita = match.v; else warnings.push(`${ctx}: tenuta contabilità "${contabInserito}" non riconosciuta, lasciata vuota (da completare).`);
  }

  let addebitoF24 = '';
  const addInserito = get('addebitoF24');
  if (addInserito) {
    const match = SCELTE_ADDEBITO_F24.find(o => o.l.toLowerCase() === addInserito.toLowerCase() || o.v.toLowerCase() === addInserito.toLowerCase());
    if (match) addebitoF24 = match.v; else warnings.push(`${ctx}: addebito F24 "${addInserito}" non riconosciuto, lasciato vuoto (da completare).`);
  }

  let previdenza = '';
  const prevInserito = get('previdenza');
  if (prevInserito) {
    const match = PREVIDENZE.find(p => p.toLowerCase() === prevInserito.toLowerCase());
    if (match) previdenza = match; else warnings.push(`${ctx}: previdenza "${prevInserito}" non riconosciuta, lasciata vuota (da completare).`);
  }

  const siNo = (chiave, etichetta) => {
    const v = get(chiave);
    if (!v) return '';
    if (/^(si|sì|s|yes|y|true|1)$/i.test(v)) return 'SI';
    if (/^(no|n|false|0)$/i.test(v)) return 'NO';
    warnings.push(`${ctx}: ${etichetta} "${v}" non riconosciuto (usa Sì/No), lasciato vuoto.`);
    return '';
  };
  const iscrittoRegistroImprese = siNo('iscrittoRegistroImprese', 'iscrizione al Registro Imprese');
  const pmiInnovativa = siNo('pmiInnovativa', 'PMI innovativa');
  const startupInnovativa = siNo('startupInnovativa', 'start-up innovativa');
  const haDipendenti = siNo('haDipendenti', 'ha dipendenti');
  let organoControllo = '';
  const organoInserito = get('organoControllo');
  if (organoInserito) {
    const match = OPZIONI_ORGANO_CONTROLLO.find(o => o.toLowerCase() === organoInserito.toLowerCase());
    if (match) organoControllo = match; else warnings.push(`${ctx}: organo di controllo "${organoInserito}" non riconosciuto, lasciato vuoto.`);
  }

  const atecoCodici = Array.from(new Set(get('ateco').split(',').map(s => s.trim()).filter(Boolean)));

  const cliente = {
    id: uid('cli'), tipo, ragioneSociale,
    codiceFiscale: get('codiceFiscale'), partitaIva: get('partitaIva'),
    atecoCodici, naturaGiuridica: '', regimeFiscale, pmiInnovativa, startupInnovativa, organoControllo, iscrittoRegistroImprese, haDipendenti,
    contatti: {
      email: get('email'), emailAmministrazione: '', pec: get('pec'), telefono: get('telefono'),
      indirizzo: get('indirizzo'), cap: get('cap'), localita: get('localita'), provincia: get('provincia').toUpperCase(),
    },
    responsabileStudio, addebitoF24, contabilita, stato: 'attivo',
    periodicitaIva, periodicitaIntrastat: 'N.A.', previdenza,
    flags: {}, dirittoCameraleScelta: null, versamentoImposteScelta: SCELTE_VERSAMENTO_IMPOSTE[1],
    adempimentiAnnualiApplicabili: [], note: get('note'),
    settore: get('settore'), annoIngresso: new Date().getFullYear(), canaleAcquisizione: get('canaleAcquisizione'), preventivoAnnuo: null,
    mandatario: get('mandatario'),
    creatoIl: oggiISO(),
  };
  const annoIn = parseInt(get('annoIngresso'), 10);
  if (annoIn >= 1950 && annoIn <= 2100) cliente.annoIngresso = annoIn;
  const prevAnn = parseFloat(get('preventivoAnnuo').replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.'));
  if (!isNaN(prevAnn) && prevAnn > 0) cliente.preventivoAnnuo = prevAnn;
  return { cliente, warnings };
}

/* Calcola cosa succederebbe importando (nessuna scrittura): usa COLONNE_IMPORT_CLIENTI[].idx già
   impostati (da mappatura automatica o scelta nel wizard). */
function pianificaImportClienti(righe) {
  const esistenti = new Set();
  STATE.clienti.forEach(c => {
    if (c.partitaIva) esistenti.add('piva:' + c.partitaIva.trim().toLowerCase());
    if (c.codiceFiscale) esistenti.add('cf:' + c.codiceFiscale.trim().toLowerCase());
  });
  const nuoviClienti = [];
  const tuttiWarning = [];
  let saltatiDuplicati = 0, saltatiVuoti = 0;
  const nomiDuplicati = [];
  for (let i = 1; i < righe.length; i++) {
    const valori = righe[i];
    if (!valori || valori.every(v => String(v || '').trim() === '')) continue; // riga completamente vuota
    const { cliente, warnings } = clienteDaRigaImport(valori, i + 1);
    tuttiWarning.push(...warnings);
    if (!cliente) { saltatiVuoti++; continue; }
    const chiavePiva = cliente.partitaIva ? 'piva:' + cliente.partitaIva.trim().toLowerCase() : null;
    const chiaveCf = cliente.codiceFiscale ? 'cf:' + cliente.codiceFiscale.trim().toLowerCase() : null;
    if ((chiavePiva && esistenti.has(chiavePiva)) || (chiaveCf && esistenti.has(chiaveCf))) { saltatiDuplicati++; nomiDuplicati.push(cliente.ragioneSociale); continue; }
    if (chiavePiva) esistenti.add(chiavePiva);
    if (chiaveCf) esistenti.add(chiaveCf);
    nuoviClienti.push(cliente);
  }
  return { nuoviClienti, tuttiWarning, saltatiDuplicati, saltatiVuoti, nomiDuplicati };
}
function applicaMappaturaImportClienti(mappa) {
  COLONNE_IMPORT_CLIENTI.forEach(c => { c.idx = (mappa && mappa[c.chiave] != null) ? mappa[c.chiave] : -1; });
}
function elaboraImportClienti(righe) {
  if (!righe || righe.length < 2) { alert('Il file non contiene righe da importare (serve almeno l\'intestazione più una riga di dati).'); return; }
  applicaMappaturaImportClienti(mappaturaAutomaticaImportClienti(righe[0]));
  const colonnaRagioneSociale = COLONNE_IMPORT_CLIENTI.find(c => c.chiave === 'ragioneSociale');
  if (!colonnaRagioneSociale || colonnaRagioneSociale.idx === -1) {
    alert('Non trovo la colonna "Ragione sociale / Nome" nell\'intestazione: verifica di aver usato (o non aver rinominato le colonne del) il template scaricato dall\'app.');
    return;
  }
  const { nuoviClienti, tuttiWarning, saltatiDuplicati, saltatiVuoti } = pianificaImportClienti(righe);

  if (nuoviClienti.length === 0) {
    alert(`Nessun cliente importato.${saltatiDuplicati ? ` ${saltatiDuplicati} riga/e scartate perché già presenti (stessa P.IVA o CF).` : ''}${saltatiVuoti ? ` ${saltatiVuoti} riga/e senza ragione sociale.` : ''}`);
    return;
  }

  STATE.clienti.push(...nuoviClienti);
  salvaStato();
  render();

  let msg = `Importat${nuoviClienti.length === 1 ? 'o' : 'i'} ${nuoviClienti.length} client${nuoviClienti.length === 1 ? 'e' : 'i'}.`;
  if (saltatiDuplicati) msg += ` ${saltatiDuplicati} già presenti, saltati.`;
  if (saltatiVuoti) msg += ` ${saltatiVuoti} riga/e senza ragione sociale, saltate.`;
  toast(msg);
  if (tuttiWarning.length) {
    console.warn('Import clienti — avvisi:', tuttiWarning);
    setTimeout(() => alert(`Import completato con ${tuttiWarning.length} avviso/i (valori non riconosciuti, lasciati vuoti: i clienti restano "da completare" finché non li compili dalla scheda):\n\n` + tuttiWarning.slice(0, 15).join('\n') + (tuttiWarning.length > 15 ? `\n… e altri ${tuttiWarning.length - 15}.` : '')), 300);
  }
}

/* -------- Wizard di import guidato (task #211) --------
   File -> abbinamento colonne (riconosciute da sole, correggibili) -> anteprima con conteggi
   (nuovi / già presenti / saltati) e primi clienti -> conferma. Nulla viene scritto prima del "Importa". */
let IMPORT_CLI = null; // {nomeFile, righe, mappa}
function apriWizardImportClienti(nomeFile, righe) {
  if (!righe || righe.length < 2) { alert('Il file non contiene righe da importare (serve almeno l\'intestazione più una riga di dati).'); return; }
  IMPORT_CLI = { nomeFile, righe, mappa: mappaturaAutomaticaImportClienti(righe[0]) };
  renderWizardImportClienti();
}
function renderWizardImportClienti() {
  if (!IMPORT_CLI) return;
  const { righe, mappa, nomeFile } = IMPORT_CLI;
  const header = righe[0];
  applicaMappaturaImportClienti(mappa);
  const haRagSoc = mappa.ragioneSociale != null && mappa.ragioneSociale >= 0;
  const piano = haRagSoc ? pianificaImportClienti(righe) : null;
  const esempio = (idx) => {
    if (idx == null || idx < 0) return '';
    const v = (righe.slice(1).find(r => r && String(r[idx] || '').trim() !== '') || [])[idx];
    return v ? String(v).slice(0, 40) : '';
  };
  const apertoPrima = !!document.querySelector('#modalRoot details[data-cli-mappa][open]');
  // mappatura: TUTTE le colonne di Prisma (non solo le principali), ripiegabile per lasciare spazio all'anteprima
  const righeMappa = COLONNE_IMPORT_CLIENTI.map(c => {
    const idx = mappa[c.chiave];
    return `<tr>
      <td style="white-space:nowrap;"><b>${escapeHtml(c.intestazione)}</b>${c.chiave === 'ragioneSociale' ? ' <span style="color:var(--rosso);">*</span>' : ''}</td>
      <td><select data-action="import-cli-mappa" data-chiave="${c.chiave}" style="width:100%;max-width:260px;">
        <option value="-1">— non importare —</option>
        ${header.map((h, i) => `<option value="${i}" ${idx === i ? 'selected' : ''}>${escapeHtml(String(h || '(colonna ' + (i + 1) + ')'))}</option>`).join('')}
      </select></td>
      <td class="helptext">${escapeHtml(esempio(idx))}</td>
    </tr>`;
  }).join('');
  const nonMappate = COLONNE_IMPORT_CLIENTI.filter(c => !(mappa[c.chiave] >= 0)).length;

  // anteprima COMPLETA: una riga per ogni cliente che verrà creato, con i valori che finiranno davvero in Prisma
  const lblContab = v => v ? ((SCELTE_CONTABILITA.find(o => o.v === v) || {}).l || v) : '';
  const lblAdd = v => v ? ((SCELTE_ADDEBITO_F24.find(o => o.v === v) || {}).l || v) : '';
  const cella = (v, grave) => v !== '' && v != null ? escapeHtml(String(v)) : `<span style="color:${grave ? 'var(--rosso)' : 'var(--text-mut)'};font-weight:${grave ? 700 : 400};">${grave ? 'manca' : '—'}</span>`;
  const siNo = v => v === 'SI' ? 'Sì' : (v === 'NO' ? 'No' : '');
  const righeAnteprima = piano ? piano.nuoviClienti.map((c, n) => {
    const lv = livelliMancantiCliente(c);
    const g = k => lv.gravi.some(x => x.startsWith(k));
    const stato = lv.gravi.length ? `<span class="badge" style="background:var(--rosso);color:#fff;" title="${escapeHtml('Importanti: ' + lv.gravi.join(', ') + (lv.leggeri.length ? ' — Utili: ' + lv.leggeri.join(', ') : ''))}">⚠ ${lv.gravi.length}${lv.leggeri.length ? ' + ' + lv.leggeri.length : ''}</span>`
      : (lv.leggeri.length ? `<span class="badge" style="background:var(--giallo-bg);color:var(--giallo);" title="${escapeHtml('Utili: ' + lv.leggeri.join(', '))}">ℹ ${lv.leggeri.length}</span>` : '<span style="color:var(--verde);">✓</span>');
    const testoRicerca = [c.ragioneSociale, c.codiceFiscale, c.partitaIva, c.regimeFiscale, c.responsabileStudio, c.mandatario].join(' ').toLowerCase();
    return `<tr data-cli-q="${escapeHtml(testoRicerca)}" data-cli-livello="${lv.gravi.length ? 'grave' : (lv.leggeri.length ? 'leggero' : 'ok')}">
      <td style="color:var(--text-mut);">${n + 1}</td>
      <td style="font-weight:600;">${escapeHtml(c.ragioneSociale)}</td>
      <td>${stato}</td>
      <td>${escapeHtml(labelTipoCliente(c.tipo))}</td>
      <td>${cella(c.codiceFiscale, !c.codiceFiscale && !c.partitaIva)}</td>
      <td>${cella(c.partitaIva, false)}</td>
      <td>${cella(c.regimeFiscale, g('Regime'))}</td>
      <td>${cella(c.periodicitaIva, g('Periodicità'))}</td>
      <td>${cella(c.responsabileStudio, g('Responsabile'))}</td>
      <td>${cella(lblContab(c.contabilita), g('Tenuta'))}</td>
      <td>${cella(lblAdd(c.addebitoF24), false)}</td>
      <td>${cella(c.previdenza, false)}</td>
      <td>${cella(siNo(c.pmiInnovativa), false)}</td>
      <td>${cella(siNo(c.startupInnovativa), false)}</td>
      <td>${cella(c.organoControllo, false)}</td>
      <td>${cella(c.mandatario, false)}</td>
      <td>${cella(c.contatti.email, false)}</td>
      <td>${cella(c.contatti.pec, false)}</td>
      <td>${cella(c.contatti.telefono, false)}</td>
      <td>${cella((c.atecoCodici || []).join(', '), false)}</td>
      <td>${cella(c.annoIngresso, false)}</td>
      <td style="text-align:right;">${c.preventivoAnnuo ? escapeHtml(String(c.preventivoAnnuo)) + ' €' : '<span style="color:var(--text-mut);">—</span>'}</td>
      <td>${cella(c.canaleAcquisizione, false)}</td>
    </tr>`;
  }).join('') : '';
  const nGravi = piano ? piano.nuoviClienti.filter(c => livelliMancantiCliente(c).gravi.length).length : 0;
  const nLeggeri = piano ? piano.nuoviClienti.filter(c => { const l = livelliMancantiCliente(c); return !l.gravi.length && l.leggeri.length; }).length : 0;
  const nCompleti = piano ? piano.nuoviClienti.length - nGravi - nLeggeri : 0;
  const thSt = 'position:sticky;top:0;background:var(--card,#fff);z-index:2;white-space:nowrap;box-shadow:0 1px 0 var(--border);';
  const tabellaAnteprima = piano && piano.nuoviClienti.length ? `<div style="flex:1;min-height:0;overflow:auto;border:1px solid var(--border);border-radius:8px;">
      <table class="compact" style="white-space:nowrap;min-width:100%;"><thead><tr>
        ${['#', 'Cliente', 'Stato', 'Tipo', 'Codice fiscale', 'P.IVA', 'Regime', 'Per. IVA', 'Responsabile', 'Contabilità', 'Addebito F24', 'Previdenza', 'PMI innov.', 'Start-up', 'Organo contr.', 'Mandatario', 'Email', 'PEC', 'Telefono', 'ATECO', 'Anno', 'Preventivo', 'Canale'].map(t => `<th style="${thSt}">${t}</th>`).join('')}
      </tr></thead><tbody>${righeAnteprima}</tbody></table></div>` : '';
  const riepilogo = !haRagSoc
    ? '<div style="color:var(--rosso);font-size:13px;">Scegli la colonna della <b>Ragione sociale / Nome</b>: senza quella non si può importare.</div>'
    : `<div style="font-size:13px;line-height:1.7;">
        <b style="color:var(--verde,#1c8c4e);">${piano.nuoviClienti.length}</b> client${piano.nuoviClienti.length === 1 ? 'e' : 'i'} da importare
        (<span style="color:var(--rosso);font-weight:700;">⚠ ${nGravi}</span> con dati importanti mancanti · <span style="color:var(--giallo);font-weight:700;">ℹ ${nLeggeri}</span> con soli dati utili mancanti · <span style="color:var(--verde);font-weight:700;">✓ ${nCompleti}</span> completi)
        · <b>${piano.saltatiDuplicati}</b> già present${piano.saltatiDuplicati === 1 ? 'e' : 'i'} (stessa P.IVA o CF, saltat${piano.saltatiDuplicati === 1 ? 'o' : 'i'})
        · <b>${piano.saltatiVuoti}</b> senza nome (saltat${piano.saltatiVuoti === 1 ? 'o' : 'i'})
        ${piano.tuttiWarning.length ? `<div class="helptext">⚠ ${piano.tuttiWarning.length} valori non riconosciuti resteranno vuoti (i clienti risulteranno "da completare").</div>` : ''}
      </div>`;
  const dettagli = piano && (piano.nomiDuplicati.length || piano.tuttiWarning.length) ? `<details style="margin-top:6px;font-size:12px;"><summary style="cursor:pointer;">Dettagli: ${piano.nomiDuplicati.length ? piano.nomiDuplicati.length + ' già presenti' : ''}${piano.nomiDuplicati.length && piano.tuttiWarning.length ? ' · ' : ''}${piano.tuttiWarning.length ? piano.tuttiWarning.length + ' avvisi' : ''}</summary>
      ${piano.nomiDuplicati.length ? `<div class="helptext" style="margin:4px 0;"><b>Saltati perché già in Prisma:</b> ${piano.nomiDuplicati.map(escapeHtml).join(', ')}</div>` : ''}
      ${piano.tuttiWarning.length ? `<div class="helptext" style="margin:4px 0;max-height:120px;overflow:auto;"><b>Avvisi:</b><br>${piano.tuttiWarning.map(escapeHtml).join('<br>')}</div>` : ''}
    </details>` : '';
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:98vw;width:98vw;height:94vh;display:flex;flex-direction:column;padding:18px 20px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2 style="margin:0;">Importa clienti</h2><div class="modal-sub">${escapeHtml(nomeFile || '')} · ${righe.length - 1} righe. Qui sotto trovi TUTTI i clienti così come verranno creati: controlla prima di importare.</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <details data-cli-mappa style="margin-top:8px;" ${apertoPrima ? 'open' : ''}><summary style="cursor:pointer;font-size:13px;font-weight:600;">Abbinamento colonne (${COLONNE_IMPORT_CLIENTI.length - nonMappate}/${COLONNE_IMPORT_CLIENTI.length} riconosciute${nonMappate ? ' — ' + nonMappate + ' non abbinate' : ''}) — clicca per modificare</summary>
        <div style="max-height:34vh;overflow:auto;margin-top:6px;"><table class="compact"><thead><tr><th>Dato in Prisma</th><th>Colonna del tuo file</th><th>Esempio</th></tr></thead><tbody>${righeMappa}</tbody></table></div>
      </details>
      <div style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px;">${riepilogo}${dettagli}</div>
      ${piano && piano.nuoviClienti.length ? `<div style="display:flex;gap:10px;align-items:center;margin:8px 0;flex-wrap:wrap;">
        <input type="text" placeholder="Cerca nell'anteprima (nome, CF, P.IVA, regime, responsabile…)" data-action="import-cli-filtro" style="min-width:320px;">
        <select data-action="import-cli-filtro-livello"><option value="">Tutti</option><option value="grave">Solo con dati importanti mancanti</option><option value="leggero">Solo con dati utili mancanti</option><option value="ok">Solo completi</option></select>
        <span class="helptext" id="importCliConteggio">${piano.nuoviClienti.length} righe mostrate</span>
      </div>` : ''}
      ${tabellaAnteprima}
      <div class="modal-actions" style="margin-top:10px;">
        <button class="btn" data-action="chiudi-modal">Annulla</button>
        <button class="btn primary" data-action="import-cli-conferma" ${piano && piano.nuoviClienti.length ? '' : 'disabled'}>Importa ${piano ? piano.nuoviClienti.length : 0} client${piano && piano.nuoviClienti.length === 1 ? 'e' : 'i'}</button>
      </div>
    </div>
  </div>`;
}
/* Filtro dell'anteprima import: nasconde/mostra righe già nel DOM, senza ridisegnare il modale. */
function filtraAnteprimaImportClienti() {
  const q = ((document.querySelector('[data-action="import-cli-filtro"]') || {}).value || '').trim().toLowerCase();
  const lv = (document.querySelector('[data-action="import-cli-filtro-livello"]') || {}).value || '';
  let n = 0;
  document.querySelectorAll('tr[data-cli-q]').forEach(tr => {
    const ok = (!q || tr.dataset.cliQ.includes(q)) && (!lv || tr.dataset.cliLivello === lv);
    tr.style.display = ok ? '' : 'none';
    if (ok) n++;
  });
  const c = document.getElementById('importCliConteggio');
  if (c) c.textContent = n + ' righe mostrate';
}
function confermaWizardImportClienti() {
  if (!IMPORT_CLI) return;
  applicaMappaturaImportClienti(IMPORT_CLI.mappa);
  const { nuoviClienti, saltatiDuplicati, tuttiWarning } = pianificaImportClienti(IMPORT_CLI.righe);
  if (!nuoviClienti.length) { toast('Nessun cliente da importare.'); return; }
  STATE.clienti.push(...nuoviClienti);
  salvaStato();
  IMPORT_CLI = null;
  chiudiModal();
  render();
  toast(`Importati ${nuoviClienti.length} client${nuoviClienti.length === 1 ? 'e' : 'i'}${saltatiDuplicati ? ` (${saltatiDuplicati} già presenti, saltati)` : ''}.${tuttiWarning.length ? ' Alcuni valori sono stati sostituiti con un default.' : ''}`);
}

function importaClienti(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;
  const nome = file.name.toLowerCase();
  if (nome.endsWith('.csv')) {
    const reader = new FileReader();
    reader.onload = () => {
      try { apriWizardImportClienti(file.name, parseCSV(reader.result)); }
      catch (err) { alert('File CSV non valido: ' + err.message); }
    };
    reader.readAsText(file, 'UTF-8');
  } else {
    if (typeof XLSX === 'undefined') { alert('Libreria di lettura Excel non disponibile (serve una connessione internet al primo caricamento della pagina). In alternativa scarica il template in CSV: funziona sempre, anche offline.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result, { type: 'array' });
        const foglio = wb.Sheets[wb.SheetNames[0]];
        const righe = XLSX.utils.sheet_to_json(foglio, { header: 1, raw: false, defval: '' });
        apriWizardImportClienti(file.name, righe);
      } catch (err) { alert('File Excel non valido: ' + err.message); }
    };
    reader.readAsArrayBuffer(file);
  }
  inputEl.value = '';
}

