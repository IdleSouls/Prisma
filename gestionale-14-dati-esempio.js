'use strict';
/* -------------------- DATI DI ESEMPIO (per test / demo) -------------------- */
function generaDatiEsempio() {
  const anno = new Date().getFullYear();
  const mk = (over) => Object.assign({
    id: uid('cli'), tipo: 'societa_capitali', codiceFiscale: '', partitaIva: '', atecoCodici: [], naturaGiuridica: '',
    contatti: { pec: '' }, addebitoF24: 'NOI', contabilita: 'ESTERNA', stato: 'attivo',
    periodicitaIva: 'N.A.', periodicitaIntrastat: 'N.A.', previdenza: 'No previdenza',
    flags: {}, dirittoCameraleScelta: null, versamentoImposteScelta: SCELTE_VERSAMENTO_IMPOSTE[1], adempimentiAnnualiApplicabili: [], note: '', creatoIl: oggiISO(),
    settore: '', annoIngresso: anno, canaleAcquisizione: 'Passaparola', preventivoAnnuo: null,
  }, over);

  const clienti = [
    mk({ ragioneSociale: 'Rossi Impianti Elettrici SRL', tipo:'societa_capitali', partitaIva:'02345670241', regimeFiscale:'Ordinario',
      responsabileStudio:'Matteo', periodicitaIva:'Mensile',
      flags:{ bolloFattElett:true, inail:true, imu:true, paghe:true },
      dirittoCameraleScelta:'30/06 (ordinaria — non ISA)', versamentoImposteScelta:'30/06 (ordinaria — non ISA)',
      adempimentiAnnualiApplicabili:['DICH_IVA_ANNUALE','CU','770','DIRITTO_CAMERALE','BILANCIO','VIDIMAZIONE_LIBRI','REDDITI_ORDINARI'],
      settore:'Impiantistica elettrica civile e industriale', annoIngresso: anno-6, canaleAcquisizione:'Passaparola', preventivoAnnuo: 3200,
      contatti:{ email:'amministrazione@rossimpianti.it', emailAmministrazione:'contabilita@rossimpianti.it', telefono:'0444123001', indirizzo:'Via dell\'Artigianato 12', cap:'36100', localita:'Vicenza', provincia:'VI' } }),
    mk({ ragioneSociale: 'Bianchi Costruzioni SNC', tipo:'societa_persone', partitaIva:'02345670242', regimeFiscale:'Ordinario',
      responsabileStudio:'Sabrina', periodicitaIva:'Trimestrale', periodicitaIntrastat:'N.A.',
      flags:{ lipe:true, bolloFattElett:true, imu:true },
      dirittoCameraleScelta:'20/07 (proroga ISA/forfettari)',
      adempimentiAnnualiApplicabili:['DICH_IVA_ANNUALE','770','DIRITTO_CAMERALE','BILANCIO','REDDITI_ORDINARI'],
      settore:'Costruzioni edili', annoIngresso: anno-11, canaleAcquisizione:'Passaparola', preventivoAnnuo: 2800,
      contatti:{ email:'info@bianchicostruzioni.it', telefono:'0444123002', indirizzo:'Via Marosticana 88', cap:'36061', localita:'Bassano del Grappa', provincia:'VI' } }),
    mk({ ragioneSociale: 'Verdi Elettricista di Verdi Mario', tipo:'ditta_individuale', partitaIva:'02345670243',
      regimeFiscale:'Forfettario', responsabileStudio:'Sabrina', periodicitaIva:'N.A.', previdenza:'Artigiani/Commercianti',
      flags:{ inail:true },
      adempimentiAnnualiApplicabili:['REDDITI_FORFETTARI'],
      settore:'Installazione impianti elettrici', annoIngresso: anno-2, canaleAcquisizione:'Passaparola', preventivoAnnuo: 950,
      contatti:{ email:'verdi.mario@gmail.com', telefono:'3331234501', indirizzo:'Via Torino 5', cap:'36100', localita:'Vicenza', provincia:'VI' } }),
    mk({ ragioneSociale: 'Neri Consulenze Marketing', tipo:'persona_fisica', partitaIva:'02345670244',
      regimeFiscale:'Semplificato', responsabileStudio:'Matteo', periodicitaIva:'Trimestrale', previdenza:'Gestione Separata',
      flags:{ lipe:true, fattureEstere:true },
      adempimentiAnnualiApplicabili:['REDDITI_SEMPLIFICATI'],
      settore:'Consulenza marketing', annoIngresso: anno-3, canaleAcquisizione:'Sito web', preventivoAnnuo: 1400,
      contatti:{ email:'neri.marketing@pec.it', telefono:'3331234502', indirizzo:'Via Roma 40', cap:'36100', localita:'Vicenza', provincia:'VI' } }),
    mk({ ragioneSociale: 'Gialli Import Export SRL', tipo:'societa_capitali', partitaIva:'02345670245', regimeFiscale:'Ordinario',
      responsabileStudio:'Matteo', periodicitaIva:'Mensile', periodicitaIntrastat:'Mensile',
      flags:{ bolloFattElett:true, inail:true, oss:true, enasarco:true },
      dirittoCameraleScelta:'30/06 (ordinaria — non ISA)',
      adempimentiAnnualiApplicabili:['DICH_IVA_ANNUALE','CU','770','DIRITTO_CAMERALE','BILANCIO','REDDITI_ORDINARI'],
      settore:'Commercio import/export', annoIngresso: anno-4, canaleAcquisizione:'Sito web', preventivoAnnuo: 4100,
      contatti:{ email:'admin@gialliimportexport.com', emailAmministrazione:'amministrazione@gialliimportexport.com', telefono:'0444123005', indirizzo:'Viale Trieste 200', cap:'36100', localita:'Vicenza', provincia:'VI' } }),
    mk({ ragioneSociale: 'Studio Associato Blu (avv. e comm.)', tipo:'societa_persone', partitaIva:'02345670246',
      regimeFiscale:'Ordinario', responsabileStudio:'Sabrina', periodicitaIva:'Trimestrale', previdenza:'Cassa Privata',
      flags:{ lipe:true },
      adempimentiAnnualiApplicabili:['DICH_IVA_ANNUALE','770','VIDIMAZIONE_LIBRI','REDDITI_ORDINARI'],
      settore:'Studio professionale associato', annoIngresso: anno-9, canaleAcquisizione:'Passaparola', preventivoAnnuo: 2600,
      contatti:{ email:'segreteria@studioblu.it', telefono:'0444123006', indirizzo:'Corso Palladio 15', cap:'36100', localita:'Vicenza', provincia:'VI' } }),
    mk({ ragioneSociale: 'Marroni Autotrasporti SRL', tipo:'societa_capitali', partitaIva:'02345670247', regimeFiscale:'Ordinario',
      responsabileStudio:'Sabrina', periodicitaIva:'Mensile',
      flags:{ bolloFattElett:true, inail:true, imu:true, fattureEstere:true },
      dirittoCameraleScelta:'20/07 (proroga ISA/forfettari)',
      adempimentiAnnualiApplicabili:['DICH_IVA_ANNUALE','CU','770','DIRITTO_CAMERALE','BILANCIO','REDDITI_ORDINARI'],
      settore:'Autotrasporto merci conto terzi', annoIngresso: anno-7, canaleAcquisizione:'Passaparola', preventivoAnnuo: 3600,
      contatti:{ email:'info@marroniautotrasporti.it', telefono:'0444123007', indirizzo:'Via Postumia 60', cap:'36071', localita:'Arzignano', provincia:'VI' } }),
    mk({ ragioneSociale: 'Ferrari Michela — Acconciature', tipo:'ditta_individuale', partitaIva:'02345670248',
      regimeFiscale:'Forfettario', responsabileStudio:'Matteo', periodicitaIva:'N.A.', previdenza:'Artigiani/Commercianti',
      flags:{ inail:true },
      adempimentiAnnualiApplicabili:['REDDITI_FORFETTARI'],
      settore:'Acconciatore', annoIngresso: anno-1, canaleAcquisizione:'Passaparola', preventivoAnnuo: 850,
      contatti:{ email:'michela.ferrari@gmail.com', telefono:'3331234508', indirizzo:'Via Firenze 3', cap:'36100', localita:'Vicenza', provincia:'VI' } }),
    mk({ ragioneSociale: 'Studio Legale Colombo & Associati', tipo:'societa_persone', partitaIva:'02345670249',
      regimeFiscale:'Ordinario', responsabileStudio:'Sabrina', periodicitaIva:'Trimestrale', previdenza:'Cassa Privata',
      flags:{ lipe:true },
      adempimentiAnnualiApplicabili:['DICH_IVA_ANNUALE','770','VIDIMAZIONE_LIBRI','REDDITI_ORDINARI'],
      settore:'Studio legale', annoIngresso: anno-5, canaleAcquisizione:'Passaparola', preventivoAnnuo: 2200,
      contatti:{ email:'segreteria@colomboassociati.it', telefono:'0444123009', indirizzo:'Contra' + '’' + ' Porti 22', cap:'36100', localita:'Vicenza', provincia:'VI' } }),
    mk({ ragioneSociale: 'Esposito Giovanni — Idraulico', tipo:'ditta_individuale', partitaIva:'02345670250',
      regimeFiscale:'Semplificato', responsabileStudio:'Matteo', periodicitaIva:'Trimestrale', previdenza:'Artigiani/Commercianti',
      flags:{ lipe:true, inail:true },
      adempimentiAnnualiApplicabili:['REDDITI_SEMPLIFICATI'],
      settore:'Idraulica e climatizzazione', annoIngresso: anno-3, canaleAcquisizione:'Passaparola', preventivoAnnuo: 1100,
      contatti:{ email:'esposito.idraulico@gmail.com', telefono:'3331234510', indirizzo:'Via Milano 18', cap:'36015', localita:'Schio', provincia:'VI' } }),
    mk({ ragioneSociale: 'Wellness Center Armonia SRL', tipo:'societa_capitali', partitaIva:'02345670251', regimeFiscale:'Ordinario',
      responsabileStudio:'Sabrina', periodicitaIva:'Mensile',
      flags:{ bolloFattElett:true, inail:true, imu:true },
      dirittoCameraleScelta:'30/06 (ordinaria — non ISA)',
      adempimentiAnnualiApplicabili:['DICH_IVA_ANNUALE','CU','770','DIRITTO_CAMERALE','BILANCIO','REDDITI_ORDINARI'],
      settore:'Centro benessere e spa', annoIngresso: anno-2, canaleAcquisizione:'Sito web', preventivoAnnuo: 2900,
      contatti:{ email:'info@armoniawellness.it', telefono:'0444123011', indirizzo:'Via Zamenhof 14', cap:'36100', localita:'Vicenza', provincia:'VI' } }),
    mk({ ragioneSociale: 'Tech Solutions Vicenza Srls', tipo:'societa_capitali', partitaIva:'02345670252', regimeFiscale:'Ordinario',
      responsabileStudio:'Matteo', periodicitaIva:'Mensile', periodicitaIntrastat:'Mensile',
      flags:{ bolloFattElett:true, oss:true, fattureEstere:true },
      dirittoCameraleScelta:'20/08 (ISA/forfettari, con magg. 0,8%)',
      adempimentiAnnualiApplicabili:['DICH_IVA_ANNUALE','CU','770','DIRITTO_CAMERALE','BILANCIO','REDDITI_ORDINARI'],
      settore:'Sviluppo software ed e-commerce', annoIngresso: anno-1, canaleAcquisizione:'Sito web', preventivoAnnuo: 3400,
      contatti:{ email:'admin@techsolutionsvi.it', emailAmministrazione:'billing@techsolutionsvi.it', telefono:'0444123012', indirizzo:'Via dell\'Innovazione 7', cap:'36100', localita:'Vicenza', provincia:'VI' } }),
    mk({ ragioneSociale: 'Cave di Marmo Pietra Viva SNC', tipo:'societa_persone', partitaIva:'02345670253', regimeFiscale:'Ordinario',
      responsabileStudio:'Sabrina', periodicitaIva:'Trimestrale',
      flags:{ lipe:true, bolloFattElett:true, inail:true, imu:true },
      dirittoCameraleScelta:'30/06 (ordinaria — non ISA)',
      adempimentiAnnualiApplicabili:['DICH_IVA_ANNUALE','770','DIRITTO_CAMERALE','BILANCIO'],
      settore:'Estrazione e lavorazione marmi', annoIngresso: anno-13, canaleAcquisizione:'Passaparola', preventivoAnnuo: 2400,
      stato:'cessato',
      contatti:{ email:'info@pietraviva.it', telefono:'0444123013', indirizzo:'Via Cave 1', cap:'36072', localita:'Chiampo', provincia:'VI' } }),
    mk({ ragioneSociale: 'Pasticceria Dolce Vita di Fontana Elena', tipo:'ditta_individuale', partitaIva:'02345670254',
      regimeFiscale:'Forfettario', responsabileStudio:'Matteo', periodicitaIva:'N.A.', previdenza:'Artigiani/Commercianti',
      flags:{ inail:true },
      adempimentiAnnualiApplicabili:['REDDITI_FORFETTARI'],
      settore:'Pasticceria artigianale', annoIngresso: anno, canaleAcquisizione:'Passaparola', preventivoAnnuo: 900,
      contatti:{ email:'elena.fontana@gmail.com', telefono:'3331234514', indirizzo:'Piazza Duomo 3', cap:'36016', localita:'Thiene', provincia:'VI' } }),
    mk({ ragioneSociale: 'Associazione Sportiva Dilettantistica Vicenza Nord', tipo:'associazione', partitaIva:'02345670255',
      // Regime forfettario L.398/1991: IVA/IRES forfettaria trimestrale sui proventi commerciali
      // (flag iva398) + rendiconto annuale L.398 + Modello EAS + affiliazione/tesseramento CONI —
      // niente vidimazione libri sociali (quella riguarda le società di capitali, non le associazioni).
      regimeFiscale:'Forfettario L.398/91', responsabileStudio:'Sabrina', periodicitaIva:'N.A.', versamentoImposteScelta:null,
      flags:{ iva398:true },
      adempimentiAnnualiApplicabili:['RENDICONTO_398', 'MODELLO_EAS', 'AFFILIAZIONE_SPORTIVA'],
      settore:'Associazione sportiva dilettantistica', annoIngresso: anno-4, canaleAcquisizione:'Passaparola', preventivoAnnuo: 600,
      contatti:{ email:'segreteria@asdvicenzanord.it', telefono:'0444123015', indirizzo:'Via dello Sport 9', cap:'36100', localita:'Vicenza', provincia:'VI' } }),
    mk({ ragioneSociale: 'Global Trade Import Srl', tipo:'societa_capitali', partitaIva:'02345670256', regimeFiscale:'Ordinario',
      responsabileStudio:'Matteo', periodicitaIva:'Mensile', periodicitaIntrastat:'Mensile',
      flags:{ bolloFattElett:true, inail:true, oss:true, fattureEstere:true },
      dirittoCameraleScelta:'20/07 (proroga ISA/forfettari)',
      adempimentiAnnualiApplicabili:['DICH_IVA_ANNUALE','CU','770','DIRITTO_CAMERALE','BILANCIO','REDDITI_ORDINARI'],
      settore:'Commercio all\'ingrosso internazionale', annoIngresso: anno-5, canaleAcquisizione:'Fiera di settore', preventivoAnnuo: 4800,
      contatti:{ email:'office@globaltradeimport.it', telefono:'0444123016', indirizzo:'Via dell\'Industria 45', cap:'36071', localita:'Arzignano', provincia:'VI' } }),
    mk({ ragioneSociale: 'Bar Centrale di Rossi & Bianchi Snc', tipo:'societa_persone', partitaIva:'02345670257', regimeFiscale:'Semplificato',
      responsabileStudio:'Sabrina', periodicitaIva:'Trimestrale',
      flags:{ lipe:true, inail:true },
      adempimentiAnnualiApplicabili:['REDDITI_SEMPLIFICATI','770'],
      settore:'Bar e ristorazione', annoIngresso: anno-8, canaleAcquisizione:'Passaparola', preventivoAnnuo: 1500,
      contatti:{ email:'barcentrale@pec.it', telefono:'0444123017', indirizzo:'Piazza dei Signori 1', cap:'36100', localita:'Vicenza', provincia:'VI' } }),
    mk({ ragioneSociale: 'Consulenza Informatica di Ferretti Luca', tipo:'persona_fisica', partitaIva:'02345670258',
      regimeFiscale:'Semplificato', responsabileStudio:'Matteo', periodicitaIva:'Trimestrale', previdenza:'Gestione Separata',
      flags:{ lipe:true, fattureEstere:true },
      adempimentiAnnualiApplicabili:['REDDITI_SEMPLIFICATI'],
      settore:'Consulenza informatica freelance', annoIngresso: anno-2, canaleAcquisizione:'Sito web', preventivoAnnuo: 1300,
      contatti:{ email:'luca.ferretti@pec.it', telefono:'3331234518', indirizzo:'Via Trento 9', cap:'36061', localita:'Bassano del Grappa', provincia:'VI' } }),
    mk({ ragioneSociale: 'Immobiliare Colli Berici Srl — in liquidazione', tipo:'societa_capitali', partitaIva:'02345670259', regimeFiscale:'Ordinario',
      responsabileStudio:'Sabrina', periodicitaIva:'Mensile',
      flags:{ bolloFattElett:true, imu:true },
      dirittoCameraleScelta:'30/06 (ordinaria — non ISA)',
      adempimentiAnnualiApplicabili:['DICH_IVA_ANNUALE','CU','770','DIRITTO_CAMERALE','BILANCIO'],
      settore:'Gestione immobiliare', annoIngresso: anno-10, canaleAcquisizione:'Passaparola', preventivoAnnuo: 2100,
      stato:'cessato',
      contatti:{ email:'info@colliberici-immobiliare.it', telefono:'0444123019', indirizzo:'Via dei Colli 30', cap:'36021', localita:'Barbarano Mossano', provincia:'VI' } }),
    mk({ ragioneSociale: 'Farmacia San Marco di Bertoli Dott.ssa Alice', tipo:'ditta_individuale', partitaIva:'02345670260',
      regimeFiscale:'Ordinario', responsabileStudio:'Matteo', periodicitaIva:'Mensile', previdenza:'Cassa Privata',
      flags:{ bolloFattElett:true, inail:true },
      adempimentiAnnualiApplicabili:['DICH_IVA_ANNUALE','770','REDDITI_ORDINARI'],
      settore:'Farmacia', annoIngresso: anno-6, canaleAcquisizione:'Passaparola', preventivoAnnuo: 2500,
      contatti:{ email:'farmacia.sanmarco@pec.it', telefono:'0444123020', indirizzo:'Corso San Marco 5', cap:'36100', localita:'Vicenza', provincia:'VI' } }),
    mk({ ragioneSociale: 'Nuovo Cliente Onboarding Srl', tipo:'societa_capitali', partitaIva:'02345670261', regimeFiscale:'Ordinario',
      responsabileStudio:'Sabrina', periodicitaIva:'Mensile',
      flags:{},
      adempimentiAnnualiApplicabili:['DICH_IVA_ANNUALE','REDDITI_ORDINARI'],
      settore:'Servizi alle imprese', annoIngresso: anno, canaleAcquisizione:'Sito web', preventivoAnnuo: 1800,
      contatti:{ email:'info@nuovoclienteonboarding.it', telefono:'0444123021', indirizzo:'Via Nuova 1', cap:'36100', localita:'Vicenza', provincia:'VI' } }),
    mk({ ragioneSociale: 'Traslochi Veneti di Marchetti Diego', tipo:'ditta_individuale', partitaIva:'02345670262',
      regimeFiscale:'Semplificato', responsabileStudio:'Matteo', periodicitaIva:'Trimestrale', previdenza:'Artigiani/Commercianti',
      flags:{ lipe:true, inail:true },
      adempimentiAnnualiApplicabili:['REDDITI_SEMPLIFICATI'],
      settore:'Traslochi e trasporti', annoIngresso: anno-4, canaleAcquisizione:'Passaparola', preventivoAnnuo: 1200,
      contatti:{ email:'traslochiveneti@gmail.com', telefono:'3331234522', indirizzo:'Via Padova 66', cap:'36100', localita:'Vicenza', provincia:'VI' } }),
    mk({ ragioneSociale: 'Wine Bar Vino e Cultura Srls', tipo:'societa_capitali', partitaIva:'02345670263', regimeFiscale:'Ordinario',
      responsabileStudio:'Sabrina', periodicitaIva:'Trimestrale',
      flags:{ lipe:true, bolloFattElett:true, inail:true, imu:true },
      dirittoCameraleScelta:'20/07 (proroga ISA/forfettari)',
      adempimentiAnnualiApplicabili:['DICH_IVA_ANNUALE','CU','770','DIRITTO_CAMERALE','BILANCIO','REDDITI_ORDINARI'],
      settore:'Ristorazione ed enoteca', annoIngresso: anno-3, canaleAcquisizione:'Instagram', preventivoAnnuo: 2000,
      contatti:{ email:'info@vinoecultura.it', telefono:'0444123023', indirizzo:'Contra’ Cavour 4', cap:'36100', localita:'Vicenza', provincia:'VI' } }),
    mk({ ragioneSociale: 'Azienda Agricola Colli Berici di Bonato Paolo', tipo:'ditta_individuale', partitaIva:'02345670264',
      regimeFiscale:'Forfettario', responsabileStudio:'Sabrina', periodicitaIva:'N.A.', previdenza:'Agricoltura (CD/IAP)',
      flags:{ inail:true },
      adempimentiAnnualiApplicabili:['REDDITI_FORFETTARI'],
      settore:'Coltivazione viti e produzione vino', annoIngresso: anno-2, canaleAcquisizione:'Passaparola', preventivoAnnuo: 950,
      contatti:{ email:'bonato.paolo@gmail.com', telefono:'3331234524', indirizzo:'Via dei Colli 55', cap:'36021', localita:'Barbarano Mossano', provincia:'VI' } }),
  ];

  const ritenuteRighe = [
    { id: uid('rit'), clienteId: clienti[3].id, dataFattura: `${anno}-01-05`, dataPagamento: `${anno}-01-10`, numeroFattura:'FT-1', percipiente:'Studio Grafico Colombo', importo: 40, statoRit:'Pagata' },
    { id: uid('rit'), clienteId: clienti[3].id, dataFattura: `${anno}-02-05`, dataPagamento: `${anno}-02-10`, numeroFattura:'FT-2', percipiente:'Studio Grafico Colombo', importo: 35, statoRit:'Pagata' },
    { id: uid('rit'), clienteId: clienti[3].id, dataFattura: `${anno}-03-05`, dataPagamento: `${anno}-03-10`, numeroFattura:'FT-3', percipiente:'Consulente Ferri', importo: 60, statoRit:'Non pagata' },
    { id: uid('rit'), clienteId: clienti[5].id, dataFattura: `${anno}-04-05`, dataPagamento: `${anno}-04-10`, numeroFattura:'FT-4', percipiente:'Notaio Esposito', importo: 120, statoRit:'Inviata' },
    { id: uid('rit'), clienteId: clienti[8].id, dataFattura: `${anno}-01-12`, dataPagamento: `${anno}-01-15`, numeroFattura:'FT-5', percipiente:'Praticante Avv. Sartori', importo: 45, statoRit:'Pagata' },
    { id: uid('rit'), clienteId: clienti[8].id, dataFattura: `${anno}-02-12`, dataPagamento: `${anno}-02-15`, numeroFattura:'FT-6', percipiente:'Praticante Avv. Sartori', importo: 45, statoRit:'Pagata' },
    { id: uid('rit'), clienteId: clienti[17].id, dataFattura: `${anno}-05-20`, dataPagamento: `${anno}-05-25`, numeroFattura:'FT-7', percipiente:'Collaboratore esterno IT', importo: 80, statoRit:'Da pagare' },
    { id: uid('rit'), clienteId: clienti[9].id, dataFattura: `${anno}-06-08`, dataPagamento: `${anno}-06-12`, numeroFattura:'FT-8', percipiente:'Geometra Colpo', importo: 150, statoRit:'Inviata' },
    // Placeholder di esempio: fattura emessa ma non ancora pagata dal cliente — niente scadenza
    // finché non si imposta la data di pagamento (vedi calcolaScadenzeRitenute).
    { id: uid('rit'), clienteId: clienti[3].id, dataFattura: `${anno}-07-03`, dataPagamento: null, numeroFattura:'FT-9', percipiente:'Consulente Ferri', importo: 70, statoRit:'In attesa di pagamento' },
  ];

  const onboarding = {};
  onboarding[clienti[0].id] = Object.assign(nuovoOnboarding(), { mandato:true, cartaIdentita:true, codiceFiscale:true, visuraCamerale:true, questionarioAr:true, schedaCompleta:true, delegaFatture:true, delegaCassettoFiscale:true, delegaCassettoPrev:true });
  onboarding[clienti[1].id] = Object.assign(nuovoOnboarding(), { mandato:true, cartaIdentita:true, codiceFiscale:true });
  onboarding[clienti[2].id] = Object.assign(nuovoOnboarding(), { mandato:true });
  onboarding[clienti[4].id] = Object.assign(nuovoOnboarding(), { mandato:true, cartaIdentita:true, codiceFiscale:true, visuraCamerale:true, questionarioAr:true });
  onboarding[clienti[6].id] = Object.assign(nuovoOnboarding(), { mandato:true, cartaIdentita:true, codiceFiscale:true, visuraCamerale:true, questionarioAr:true, schedaCompleta:true, delegaFatture:true });
  onboarding[clienti[10].id] = Object.assign(nuovoOnboarding(), { mandato:true, cartaIdentita:true });
  onboarding[clienti[11].id] = Object.assign(nuovoOnboarding(), { mandato:true, cartaIdentita:true, codiceFiscale:true, visuraCamerale:true, questionarioAr:true, schedaCompleta:true, delegaFatture:true, delegaCassettoFiscale:true, delegaCassettoPrev:true });
  onboarding[clienti[15].id] = Object.assign(nuovoOnboarding(), { mandato:true, cartaIdentita:true, codiceFiscale:true, visuraCamerale:true, questionarioAr:true, schedaCompleta:true, delegaFatture:true, delegaCassettoFiscale:true, delegaCassettoPrev:true });
  onboarding[clienti[19].id] = Object.assign(nuovoOnboarding(), { mandato:true, cartaIdentita:true, codiceFiscale:true });
  // clienti[20] ("Nuovo Cliente Onboarding Srl") resta volutamente a 0% — cliente appena acquisito, nessuna voce ancora spuntata

  const antiriciclaggio = {};
  const amlF = (patch) => Object.assign(nuovoFascicoloAntiriciclaggio(), patch);
  antiriciclaggio[clienti[0].id] = amlF({ profiloRischio:'Basso', dataAdeguataVerifica:`${anno}-01-15`, scadenzaRevisione:`${anno+1}-01-15`,
    checklist:{ documentoIdentita:true, codiceFiscalePiva:true, titolareEffettivo:true, questionarioRischio:true, origineFondi:true, personaEsposta:true, fascicoloArchiviato:true, registroAntiriciclaggio:true },
    storico:[{ id: uid('nota'), testo:'Adeguata verifica completata in fase di onboarding, nessun elemento di rischio rilevato.', autore:'Matteo', data:`${anno}-01-15` }] });
  antiriciclaggio[clienti[1].id] = amlF({ profiloRischio:'Medio', dataAdeguataVerifica:`${anno-1}-11-03`, scadenzaRevisione:`${anno}-11-03`,
    checklist:{ documentoIdentita:true, codiceFiscalePiva:true, titolareEffettivo:true, questionarioRischio:true },
    storico:[{ id: uid('nota'), testo:'Operatività con controparti estere: profilo alzato a medio, in attesa di documentazione integrativa sull\'origine fondi.', autore:'Sabrina', data:`${anno-1}-11-03` }] });
  antiriciclaggio[clienti[3].id] = amlF({ profiloRischio:'Alto', dataAdeguataVerifica:`${anno-1}-06-10`, scadenzaRevisione:`${anno-1}-12-10`,
    checklist:{ documentoIdentita:true, codiceFiscalePiva:true, questionarioRischio:true },
    storico:[{ id: uid('nota'), testo:'Titolare effettivo con precedenti segnalazioni su altra posizione: profilo di rischio alto, revisione semestrale invece che annuale.', autore:'Matteo', data:`${anno-1}-06-10` }] });
  antiriciclaggio[clienti[6].id] = amlF({ profiloRischio:'Basso', dataAdeguataVerifica:`${anno}-03-01`, scadenzaRevisione:`${anno+1}-03-01`,
    checklist:{ documentoIdentita:true, codiceFiscalePiva:true, titolareEffettivo:true, questionarioRischio:true, origineFondi:true },
    storico:[] });
  antiriciclaggio[clienti[11].id] = amlF({ profiloRischio:'Non valutato', dataAdeguataVerifica:null, scadenzaRevisione:null, storico:[] });
  // I restanti clienti demo non hanno ancora un fascicolo aperto: fascicoloAntiriciclaggio() lo crea vuoto al primo accesso.

  // Qualche scadenza passata già marcata come gestita, per rendere il dashboard realistico
  const scadenzeOverrides = {};
  const periodicheDemo = generaScadenzePeriodiche(clienti, anno, {});
  const passate = periodicheDemo.filter(s => s.data < oggiISO());
  passate.slice(0, Math.min(45, passate.length)).forEach((s, i) => {
    let stato = 'Inviato telematicamente';
    if (i % 11 === 0) stato = 'Errore';
    else if (i % 7 === 0) stato = 'Comunicato al cliente';
    scadenzeOverrides[s.id] = { stato, dataCompletamento: stato==='Errore'?null:s.data, responsabile: s.responsabile, nota: stato==='Errore' ? 'da ricontrollare' : '' };
  });

  // Qualche sotto-adempimento annuale già avviato, per non partire sempre da 0%
  const annualiOverrides = {};
  const annualiDemo = generaAdempimentiAnnuali(clienti, anno, {});
  annualiDemo.slice(0, Math.min(10, annualiDemo.length)).forEach((a, i) => {
    const nCompletare = (i % a.sotto.length) || 1;
    const sotto = {};
    a.sotto.slice(0, nCompletare).forEach(s => { sotto[s.nome] = { completato: true, data: oggiISO(), responsabile: a.responsabile }; });
    annualiOverrides[a.id] = { responsabile: a.responsabile, sotto };
  });

  const gruppoNormativa = uid('comgrp');
  const comunicazioni = [
    { id: uid('com'), clienteId: clienti[0].id, data: `${anno}-08-20`, categoria:'Scadenza fiscale', stato:'Inviata', oggetto:'Promemoria versamento IVA agosto', corpo:'Ricordiamo che il versamento IVA di agosto va effettuato entro il 20 del mese (scadenza posticipata rispetto al 16 ordinario).', note:'', visibilePortale:true },
    { id: uid('com'), clienteId: clienti[0].id, data: `${anno}-06-05`, categoria:'Documento disponibile', stato:'Inviata', oggetto:'Trasmissione bilancio approvato', corpo:'Il bilancio approvato è disponibile nella sezione Documenti del portale.', note:'', visibilePortale:true },
    { id: uid('com'), clienteId: clienti[4].id, data: `${anno}-07-10`, categoria:'Amministrativa', stato:'Inviata', oggetto:'Chiarimenti Intrastat mensile (telefonata)', corpo:'', note:'Cliente ha capito, nessun follow-up necessario.', visibilePortale:false },
    { id: uid('com'), clienteId: clienti[11].id, data: `${anno}-05-15`, categoria:'Documento disponibile', stato:'Inviata', oggetto:'Richiesta documenti mancanti per OSS', corpo:'Ci mancano ancora alcuni giustificativi per completare la dichiarazione OSS del trimestre. Puoi caricarli o inviarceli appena possibile.', note:'', visibilePortale:true },
    { id: uid('com'), clienteId: clienti[20].id, data: `${anno}-08-28`, categoria:'Amministrativa', stato:'Programmata', oggetto:'Benvenuto in studio e richiesta documenti onboarding', corpo:'Benvenuto! Per completare l\'attivazione ci servono ancora alcuni documenti — trovi il dettaglio nella sezione onboarding.', note:'', visibilePortale:true },
    { id: uid('com'), clienteId: clienti[6].id, data: oggiISO(), categoria:'Scadenza fiscale', stato:'Bozza', oggetto:'Promemoria scadenza diritto camerale', corpo:'', note:'Bozza da rivedere prima di pubblicare.', visibilePortale:true },
    // esempio di comunicazione broadcast: stessa circolare a più clienti insieme (gruppoId condiviso)
    { id: uid('com'), clienteId: clienti[0].id, data: `${anno}-05-23`, categoria:'Novità legislativa', stato:'Inviata', oggetto:'Proroga versamenti imposte 2026 per ISA/forfettari', corpo:'Il DL 22/05/2026 n.89 ha prorogato i termini di versamento delle imposte sui redditi per i soggetti ISA e forfettari: 20/07 ordinaria, 20/08 con maggiorazione dello 0,8%. Vi aggiorneremo con la scadenza definitiva scelta per la vostra posizione.', note:'', visibilePortale:true, gruppoId: gruppoNormativa },
    { id: uid('com'), clienteId: clienti[4].id, data: `${anno}-05-23`, categoria:'Novità legislativa', stato:'Inviata', oggetto:'Proroga versamenti imposte 2026 per ISA/forfettari', corpo:'Il DL 22/05/2026 n.89 ha prorogato i termini di versamento delle imposte sui redditi per i soggetti ISA e forfettari: 20/07 ordinaria, 20/08 con maggiorazione dello 0,8%. Vi aggiorneremo con la scadenza definitiva scelta per la vostra posizione.', note:'', visibilePortale:true, gruppoId: gruppoNormativa },
    { id: uid('com'), clienteId: clienti[11].id, data: `${anno}-05-23`, categoria:'Novità legislativa', stato:'Inviata', oggetto:'Proroga versamenti imposte 2026 per ISA/forfettari', corpo:'Il DL 22/05/2026 n.89 ha prorogato i termini di versamento delle imposte sui redditi per i soggetti ISA e forfettari: 20/07 ordinaria, 20/08 con maggiorazione dello 0,8%. Vi aggiorneremo con la scadenza definitiva scelta per la vostra posizione.', note:'', visibilePortale:true, gruppoId: gruppoNormativa },
    { id: uid('com'), clienteId: clienti[15].id, data: `${anno}-05-23`, categoria:'Novità legislativa', stato:'Inviata', oggetto:'Proroga versamenti imposte 2026 per ISA/forfettari', corpo:'Il DL 22/05/2026 n.89 ha prorogato i termini di versamento delle imposte sui redditi per i soggetti ISA e forfettari: 20/07 ordinaria, 20/08 con maggiorazione dello 0,8%. Vi aggiorneremo con la scadenza definitiva scelta per la vostra posizione.', note:'', visibilePortale:true, gruppoId: gruppoNormativa },
  ];

  const comunicazioniRicorrenti = [
    { id: uid('comric'), oggetto:'Promemoria scadenze del mese', corpo:'Ecco un riepilogo delle scadenze fiscali del mese in corso per la vostra posizione — controllate la sezione Scadenze del portale per i dettagli.', categoria:'Scadenza fiscale', destinatari:{ modo:'tutti', clienteIds:[] }, frequenza:'Mensile', giorno:3, mese:1, attiva:true, ultimaGenerazionePeriodo:null },
  ];

  const documenti = [
    { id: uid('doc'), clienteId: clienti[0].id, categoria:'Visura camerale', nome:'Visura camerale aggiornata', dataCaricamento:`${anno}-01-15`, dataScadenza:`${anno}-12-31` },
    { id: uid('doc'), clienteId: clienti[0].id, categoria:'Bilancio', nome:`Bilancio approvato ${anno-1}`, dataCaricamento:`${anno}-05-20`, dataScadenza:null },
    { id: uid('doc'), clienteId: clienti[8].id, categoria:'Contratto', nome:'Mandato professionale firmato', dataCaricamento:`${anno-5}-03-01`, dataScadenza:null },
    { id: uid('doc'), clienteId: clienti[11].id, categoria:'Certificazione', nome:'DURC', dataCaricamento:`${anno}-06-01`, dataScadenza:`${anno}-09-29` },
    { id: uid('doc'), clienteId: clienti[15].id, categoria:'Visura camerale', nome:'Visura camerale', dataCaricamento:`${anno-1}-11-10`, dataScadenza:`${anno-1}-12-10` },
    { id: uid('doc'), clienteId: clienti[20].id, categoria:'Anagrafica', nome:'Carta d\'identità legale rappresentante', dataCaricamento: oggiISO(), dataScadenza:null },
    { id: uid('doc'), clienteId: clienti[3].id, categoria:'Dichiarazione fiscale', nome:`Modello Redditi ${anno-1}`, dataCaricamento:`${anno}-09-30`, dataScadenza:null },
    { id: uid('doc'), clienteId: clienti[3].id, categoria:'Busta paga', nome:'Cedolini agosto', dataCaricamento:`${anno}-09-05`, dataScadenza:null },
  ];

  const oggiDate = new Date();
  const giorniFa = (n) => { const d = new Date(oggiDate.getTime() - n*86400000); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const giorniTra_ = (n) => { const d = new Date(oggiDate.getTime() + n*86400000); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const taskTeam = [
    { id: uid('task'), titolo:'Richiedere estratto conto bancario aggiornato', clienteId: clienti[0].id, assegnatoA:'Sabrina', scadenza: giorniTra_(8), noteStorico:[{id:uid('nota'),testo:'Serve per chiudere la liquidazione IVA del mese.',autore:'Matteo',data:oggiISO()}], stato:'Da fare', creatoIl: oggiISO() },
    { id: uid('task'), titolo:'Controllare visura camerale scaduta', clienteId: clienti[15].id, assegnatoA:'Matteo', scadenza: giorniFa(5), noteStorico:[{id:uid('nota'),testo:'La visura in archivio è scaduta, richiederne una aggiornata al cliente.',autore:'Matteo',data:giorniFa(10)}], stato:'Da fare', creatoIl: giorniFa(10) },
    { id: uid('task'), titolo:'Preparare pratica assunzione dipendente', clienteId: clienti[0].id, assegnatoA:'Matteo', scadenza: null, noteStorico:[{id:uid('nota'),testo:'Il cliente vuole assumere un operaio da ottobre.',autore:'Matteo',data:giorniFa(3)},{id:uid('nota'),testo:'Sentito il cliente: assunzione confermata per il 1° ottobre, serve il contratto pronto entro fine settembre.',autore:'Sabrina',data:giorniFa(1)}], stato:'In corso', creatoIl: giorniFa(3) },
    { id: uid('task'), titolo:'Rinnovo abbonamento software antiriciclaggio', clienteId: null, assegnatoA:'Sabrina', scadenza: giorniTra_(120), noteStorico:[{id:uid('nota'),testo:'Task generale dello studio, non legato a un cliente specifico.',autore:'Matteo',data:oggiISO()}], stato:'Da fare', creatoIl: oggiISO() },
    { id: uid('task'), titolo:'Chiudere pratica cessazione partita IVA', clienteId: clienti[18].id, assegnatoA:'Matteo', scadenza: giorniFa(20), noteStorico:[], stato:'Fatto', creatoIl: giorniFa(40) },
  ];

  // Preventivi, mandati e documenti AML demo: generati dai modelli di default (task #127) così da
  // mostrare il nuovo motore a placeholder già "risolto" e non solo modelli vuoti.
  const modelloPer = (cat) => (STATE.modelliDocumento || []).find(m => m.categoria === cat) || null;
  const creaDocumentoDemo = (clienteId, categoria, modello, oggetto, importo, dataEmissione, validoFino, stato, note, valoriCustom, corpoManuale) => {
    const valoriRiservati = { oggetto: oggetto || '', importo: importo != null ? fmtNum2(importo) : '', dataEmissione: fmtData(dataEmissione), validoFino: validoFino ? fmtData(validoFino) : '' };
    const corpo = modello ? risolviTemplateDocumento(modello.corpo, clienteId, Object.assign({}, valoriRiservati, valoriCustom || {})) : (corpoManuale || '');
    return { id: uid('doc'), clienteId, categoria, modelloId: modello ? modello.id : null, nomeModello: modello ? modello.nome : null, oggetto, importo, dataEmissione, validoFino, stato, note: note || '', valoriCustom: valoriCustom || {}, corpo, creatoIl: dataEmissione };
  };
  const modPreventivo = modelloPer('Preventivo');
  const modMandato = modelloPer('Mandato professionale');
  const modAmlDichiarazione = modelloPer('AML - Dichiarazione cliente');
  const modAmlNota = modelloPer('AML - Nota di accettazione incarico');
  const preventivi = [
    creaDocumentoDemo(clienti[0].id, 'Preventivo', modPreventivo, 'Tenuta contabilità ordinaria e assistenza fiscale 2026', 3600, giorniFa(15), giorniTra_(15), 'Inviato',
      'Cliente storico, condizioni invariate rispetto al 2025.',
      { dettaglioAttivita: '- Tenuta della contabilità ordinaria;\n- Liquidazioni periodiche IVA (mensili);\n- Predisposizione bilancio d\'esercizio e nota integrativa;\n- Dichiarazione dei redditi (Modello REDDITI SC) e IRAP.',
        condizioniPagamento: 'Acconto del 30% alla sottoscrizione, saldo rateizzato in 9 fatture mensili da gennaio a settembre.' }),
    creaDocumentoDemo(clienti[15].id, 'Mandato professionale', modMandato, 'Assistenza fiscale continuativa e consulenza IVA', 5200, giorniFa(60), null, 'Accettato',
      'Firmato in studio il ' + fmtData(giorniFa(55)) + '.',
      { dettaglioAttivita: 'Consulenza fiscale continuativa su operazioni IVA intracomunitarie ed extra-UE, assistenza in sede di verifica e controllo, supporto nella gestione degli adempimenti Intrastat.',
        condizioniPagamento: 'Fatturazione trimestrale posticipata, pagamento a 30 giorni data fattura.' }),
    // Lettera di incarico: nessun modello di default per questa categoria — testo scritto a mano,
    // a dimostrazione che un documento non richiede necessariamente un modello.
    creaDocumentoDemo(clienti[1].id, 'Lettera di incarico', null, 'Predisposizione bilancio d\'esercizio ' + (anno-1), 1400, giorniFa(200), null, 'Rifiutato',
      'Il cliente ha preferito rivolgersi a un altro studio per questo incarico specifico.', {},
      `Spett.le Bianchi Costruzioni SNC\n\nOggetto: Predisposizione bilancio d'esercizio ${anno-1}\n\nCon la presente Le trasmettiamo la nostra proposta per la redazione del bilancio d'esercizio, comprensiva di nota integrativa e deposito presso la Camera di Commercio.\n\nCompenso concordato: € 1.400,00.\n\nRestiamo a disposizione per ogni chiarimento.\n\nDistinti saluti.`),
    creaDocumentoDemo(clienti[3].id, 'Preventivo', modPreventivo, 'Apertura nuova posizione IVA e primo anno di gestione', 1800, oggiISO(), giorniTra_(30), 'Bozza', '',
      { dettaglioAttivita: 'Apertura della partita IVA, iscrizione al regime forfettario, tenuta della contabilità per il primo anno di attività, predisposizione della dichiarazione dei redditi.',
        condizioniPagamento: 'Pagamento in un\'unica soluzione all\'accettazione del preventivo.' }),
    // Documenti antiriciclaggio per il cliente demo con profilo di rischio "Alto" (clienti[3], vedi
    // fascicolo antiriciclaggio sopra): mostrano la sezione Documenti del fascicolo già popolata.
    creaDocumentoDemo(clienti[3].id, 'AML - Dichiarazione cliente', modAmlDichiarazione, 'Adeguata verifica della clientela', null, giorniFa(200), null, 'Firmato', '',
      { esecutoreNome: 'Marco Neri', esecutoreCf: 'NRIMRC80A01L840X', esecutoreNascita: 'Vicenza, 01/01/1980', esecutoreCittadinanza: 'Italiana',
        esecutoreResidenza: 'Via Roma 10, 36100 Vicenza (VI)', esecutoreDocumento: 'Carta d\'identità n. AV1234567, rilasciata dal Comune di Vicenza il 12/03/2019',
        titolareEffettivo: 'Coincide con il cliente, in quanto persona fisica titolare dell\'attività.',
        pep: 'Il cliente dichiara di non ricoprire, né aver ricoperto negli ultimi 12 mesi, cariche pubbliche rilevanti ai fini della normativa PEP.',
        provenienzaFondi: 'Redditi da attività di consulenza di marketing esercitata in forma individuale.', mezziPagamento: 'Bonifico bancario.',
        attivitaCliente: 'Consulenza e servizi di marketing per piccole e medie imprese.',
        valutazioneRischio: 'Rischio Alto — titolare con precedenti segnalazioni su altra posizione professionale; revisione semestrale anziché annuale.',
        clienteRea: 'VI-398421', scopoPrestazione: 'Assistenza contabile e fiscale continuativa.' }),
    creaDocumentoDemo(clienti[3].id, 'AML - Nota di accettazione incarico', modAmlNota, 'Accettazione incarico di assistenza contabile e fiscale continuativa', null, giorniFa(200), null, 'Firmato', '',
      { titolareEffettivo: 'Coincide con il cliente, in quanto persona fisica titolare dell\'attività.',
        valutazioneRischio: 'Rischio Alto — titolare con precedenti segnalazioni su altra posizione professionale; revisione semestrale anziché annuale.',
        elementiRischio: 'Precedenti segnalazioni a carico del titolare effettivo su altra posizione professionale; operatività con incassi in contante superiori alla media del settore.',
        misureAdottate: 'Acquisizione di documentazione rafforzata sull\'origine dei fondi, monitoraggio semestrale anziché annuale, verifica periodica delle transazioni.',
        allegati: 'Copia documento d\'identità, dichiarazione cliente antiriciclaggio, visura camerale.' }),
  ];

  // Bilanci demo: 3 anni per Rossi Impianti (in crescita), 2 anni per Global Trade Import.
  const bilanci = {};
  bilanci[clienti[0].id] = {
    [anno-2]: { immobImmateriali:8000, immobMateriali:180000, immobFinanziarie:0, rimanenze:95000, creditiClienti:340000, liquidita:65000, altreAttivita:10000, patrimonioNetto:210000, debitiLungo:90000, debitiBreve:398000, altrePassivita:0, ricavi:1150000, costiEsterni:620000, costoPersonale:310000, ammortamenti:45000, oneriFinanziari:12000, imposte:35000, caricatoIl: oggiISO() },
    [anno-1]: { immobImmateriali:7000, immobMateriali:175000, immobFinanziarie:0, rimanenze:102000, creditiClienti:365000, liquidita:78000, altreAttivita:9000, patrimonioNetto:245000, debitiLungo:80000, debitiBreve:411000, altrePassivita:0, ricavi:1280000, costiEsterni:690000, costoPersonale:335000, ammortamenti:47000, oneriFinanziari:11000, imposte:42000, caricatoIl: oggiISO() },
    [anno]:   { immobImmateriali:6000, immobMateriali:168000, immobFinanziarie:0, rimanenze:110000, creditiClienti:380000, liquidita:92000, altreAttivita:11000, patrimonioNetto:285000, debitiLungo:70000, debitiBreve:412000, altrePassivita:0, ricavi:1390000, costiEsterni:745000, costoPersonale:365000, ammortamenti:50000, oneriFinanziari:10500, imposte:47000, caricatoIl: oggiISO() },
    // situazione infra-annuale più fresca dell'ultimo bilancio d'esercizio (stesso formato periodo,
    // solo "YYYY-MM" invece di "YYYY" — vedi etichettaEstesaBilancio/parsePeriodoHeaderBilancio)
    [`${anno+1}-06`]: { immobImmateriali:5500, immobMateriali:162000, immobFinanziarie:0, rimanenze:118000, creditiClienti:395000, liquidita:105000, altreAttivita:12000, patrimonioNetto:310000, debitiLungo:65000, debitiBreve:407000, altrePassivita:0, ricavi:730000, costiEsterni:395000, costoPersonale:190000, ammortamenti:26000, oneriFinanziari:5000, imposte:24000, caricatoIl: oggiISO() },
  };
  bilanci[clienti[15].id] = {
    [anno-1]: { immobImmateriali:12000, immobMateriali:95000, immobFinanziarie:5000, rimanenze:210000, creditiClienti:480000, liquidita:130000, altreAttivita:18000, patrimonioNetto:320000, debitiLungo:60000, debitiBreve:570000, altrePassivita:0, ricavi:2450000, costiEsterni:1980000, costoPersonale:280000, ammortamenti:22000, oneriFinanziari:18000, imposte:38000, caricatoIl: oggiISO() },
    [anno]:   { immobImmateriali:11000, immobMateriali:90000, immobFinanziarie:5000, rimanenze:225000, creditiClienti:510000, liquidita:145000, altreAttivita:16000, patrimonioNetto:352000, debitiLungo:50000, debitiBreve:605000, altrePassivita:0, ricavi:2680000, costiEsterni:2170000, costoPersonale:295000, ammortamenti:21000, oneriFinanziari:16500, imposte:44000, caricatoIl: oggiISO() },
  };

  // Contabilità demo: mapping conti già "imparati" e alcuni movimenti/fatture per Rossi Impianti,
  // per mostrare come si presenta la sezione dopo un paio di import reali.
  const contoMappings = {};
  contoMappings[clienti[0].id] = {
    'banca intesa c/c 1234': 'Banca', 'cassa contanti': 'Cassa', 'carta business visa': 'Carta di credito',
    'stipendi dipendenti': 'Personale', 'inps dipendenti': 'Personale',
  };
  const movimentiContabili = {};
  movimentiContabili[clienti[0].id] = [
    { data:giorniFa(6), conto:'Banca Intesa C/C 1234', descrizione:'Pagamento fornitore acciaio', importo:-4200.50, categoria:'Banca' },
    { data:giorniFa(6), conto:'Banca Intesa C/C 1234', descrizione:'Incasso fattura cliente Bianchi', importo:12500, categoria:'Banca' },
    { data:giorniFa(20), conto:'Stipendi dipendenti', descrizione:'Stipendi mese precedente', importo:-9800, categoria:'Personale' },
    { data:giorniFa(20), conto:'INPS dipendenti', descrizione:'F24 contributi', importo:-3100, categoria:'Personale' },
    { data:giorniFa(35), conto:'Cassa contanti', descrizione:'Piccole spese ufficio', importo:-180, categoria:'Cassa' },
  ].map(m => Object.assign(m, { id: idMovimentoContabile(clienti[0].id, m) }));
  const fattureContabili = {};
  fattureContabili[clienti[0].id] = [
    { tipo:'fattureAttive', data:giorniFa(9), numero:'34', controparte:'Bianchi Costruzioni Srl', imponibile:10245.90, iva:2254.10, totale:12500 },
    { tipo:'fattureAttive', data:giorniFa(3), numero:'35', controparte:'Verdi Impianti Srl', imponibile:7131.15, iva:1568.85, totale:8700 },
    { tipo:'fatturePassive', data:giorniFa(6), numero:'F-991', controparte:'Acciai del Nord Spa', imponibile:3443.85, iva:756.65, totale:4200.50 },
  ].map(f => Object.assign(f, { id: idFatturaContabile(clienti[0].id, f.tipo, f) }));

  // Conti demo per Rossi Impianti: banca principale + conto ponte retribuzioni, così si vede
  // subito come funziona il registro conti per i mastrini.
  const contiCliente = {};
  const contoBancaDemo = { id: uid('conto'), nome: 'Unicredit c/c' };
  const contoPagheDemo = { id: uid('conto'), nome: 'Conto ponte retribuzioni' };
  contiCliente[clienti[0].id] = [contoBancaDemo, contoPagheDemo];

  // Documenti contabili demo: mostra come si presenta lo stato "aggiornato al" desunto dai
  // documenti periodici, per Rossi Impianti.
  const documentiContabili = {};
  documentiContabili[clienti[0].id] = [
    { id: uid('doccontab'), tipo:'registroIva', dataRiferimento: giorniFa(6), dataCaricamento: giorniFa(5), note:'Da Profis' },
    { id: uid('doccontab'), tipo:'registroIva', dataRiferimento: giorniFa(3), dataCaricamento: giorniFa(2), note:'Da Profis' },
    { id: uid('doccontab'), tipo:'bilancio', dataRiferimento: giorniFa(20), dataCaricamento: giorniFa(18), note:'Bilancio 4 sezioni post imposte' },
    { id: uid('doccontab'), tipo:'mastrino', contoId: contoBancaDemo.id, dataRiferimento: giorniFa(6), dataCaricamento: giorniFa(5), note:'' },
    { id: uid('doccontab'), tipo:'mastrino', contoId: contoPagheDemo.id, dataRiferimento: giorniFa(20), dataCaricamento: giorniFa(18), note:'Stipendi + F24 contributi registrati' },
  ];

  return { clienti, ritenuteRighe, onboarding, antiriciclaggio, scadenzeOverrides, annualiOverrides, comunicazioni, comunicazioniRicorrenti, documenti, taskTeam, preventivi, bilanci, contoMappings, movimentiContabili, fattureContabili, documentiContabili, contiCliente, annoCorrente: anno };
}

