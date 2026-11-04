/** Synthetic paper-logbook fixture (invented data; not from any real logbook or photo). */
const c = (v, conf = 'high', reason) => ({ v, c: conf, ...(reason ? { reason } : {}) });
const E = () => c(null);
const row = (i, o) => ({ row_index: i, cfi_signed: o.cfi ?? true, cells: {
  date: c(o.date), aircraft_type: c(o.type ?? 'C172'), aircraft_ident: c(o.ident ?? 'N100PL', o.identConf ?? 'high', o.identConf === 'low' ? '0/D ambiguous' : undefined),
  from: c(o.from ?? 'KAAA'), to: c(o.to ?? 'KAAA'), remarks: c(o.remarks ?? 'pattern work', o.remarksConf ?? 'high'),
  takeoffs: c(o.to_ ?? 3), landings: c(o.ldg ?? 3), sel: o.sel === null ? E() : c(o.sel ?? o.total),
  sim: o.sim === undefined ? E() : c(o.sim), xc: o.xc === undefined ? E() : c(o.xc), dual: o.dual === null ? E() : c(o.dual ?? o.total),
  pic: o.pic === undefined ? E() : c(o.pic), night: E(), instrument: E(), total: o.total === null ? E() : c(o.total) } });

export const GOOD_PAGE = { rows: [
  row(0, { date: '2025-03-01', total: 1.2 }),
  row(1, { date: '2025-03-04', total: 1.5, xc: 1.5, to: 'KBBB', remarks: 'XC; passport # X12345678 checked for TSA' }),
  row(2, { date: '2025-03-06', total: null, sel: null, sim: 1.0, type: 'SIM', ident: 'FTD-1', to_: 0, ldg: 0 }),
], footer: { this_page: { total: 2.7, dual: 2.7, sim: 1.0 }, forwarded: { total: 10.0 }, to_date: { total: 12.7 } } };

export const BAD_PAGE = { rows: [
  row(0, { date: '3/9', total: 1.0 }),                                   // no year → error
  row(1, { date: '2025-03-08', total: 1.0, xc: 2.0, identConf: 'low' }),   // xc > total, low-confidence ident
  row(2, { date: '2025-03-07', total: 1.0, sim: '2 PP T', cfi: false }),  // out of order, annotation in numeric, no signoff
], footer: { this_page: { total: 9.9 }, forwarded: { total: 10.0 }, to_date: { total: 15.0 } } };
