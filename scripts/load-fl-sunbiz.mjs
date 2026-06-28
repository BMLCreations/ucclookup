// Load Florida Sunbiz corporate data file (cordata, fixed-width 1440-char records,
// 10 files cordata0-9.txt inside cordata.zip) into the be_* registry tables tagged
// juris='FL'. Two phases: (A) stream-parse each file -> 3 CSVs; (B) COPY the CSVs.
//
// Official layout: https://dos.sunbiz.org/data-definitions/cor.html (validated vs data).
// Usage:  DATABASE_URL=... node scripts/load-fl-sunbiz.mjs            (full run A+B)
//         ... node scripts/load-fl-sunbiz.mjs parse|load              (single phase)
import postgres from "postgres";
import pg from "pg";
import { from as copyFrom } from "pg-copy-streams";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";

const URL = process.env.LOAD_DATABASE_URL || process.env.DATABASE_URL;
if (!URL) { console.error("Set DATABASE_URL"); process.exit(1); }
const ZIP = process.env.CORDATA_ZIP || "C:/Users/brian/Downloads/cordata.zip";
const OUT = process.env.CORDATA_OUT || "C:/Users/brian/Downloads/fl_sunbiz";
const UNZIP = process.env.UNZIP_BIN || "unzip";
const phase = process.argv[2] || "all";
const sql = postgres(URL, { prepare: false, ssl: "require", max: 1, connect_timeout: 30, idle_timeout: 0 });
const log = (m) => console.log(new Date().toISOString().slice(11, 19), m);

// ── field helpers (1-indexed positions, validated against real records) ──
const F = (s, start, len) => s.substring(start - 1, start - 1 + len).trim();
const RAW = (s, start, len) => s.substring(start - 1, start - 1 + len);
const ENTITY_TYPE = {
  DOMP: "Corporation", DOMNP: "Non-Profit Corporation", FORP: "Foreign Corporation",
  FORNP: "Foreign Non-Profit Corporation", FLAL: "Limited Liability Company", FORL: "Foreign LLC",
  DOMLP: "Limited Partnership", FORLP: "Foreign Limited Partnership", NPREG: "Non-Profit",
  TRUST: "Trust", AGENT: "Registered Agent",
};
function pdate(s) { // MMDDYYYY -> YYYY-MM-DD, else ''
  s = s.trim();
  if (!/^\d{8}$/.test(s)) return "";
  const mm = s.slice(0, 2), dd = s.slice(2, 4), yy = s.slice(4, 8);
  if (yy < "1800" || mm < "01" || mm > "12" || dd < "01" || dd > "31") return "";
  return `${yy}-${mm}-${dd}`;
}
// Parse a 42-char name field + type flag -> {last,first,middle,org}.
//  - comma ("LAST, FIRST M") => person (old records, even when typed 'C')
//  - type 'C' (no comma)     => company => whole field is org_name
//  - else (person)           => fixed sub-positions LAST(0:20) FIRST(20:33) MIDDLE(33:42)
function pname(field, type) {
  const full = field.trim();
  if (!full) return null;
  if (full.includes(",")) {
    const ci = full.indexOf(",");
    const rest = full.slice(ci + 1).trim().split(/\s+/);
    return { last: full.slice(0, ci).trim(), first: rest[0] || "", middle: rest.slice(1).join(" "), org: "" };
  }
  if (type === "C") return { last: "", first: "", middle: "", org: full };
  const last = field.slice(0, 20).trim(), first = field.slice(20, 33).trim(), middle = field.slice(33, 42).trim();
  if (!first && !middle) return { last: "", first: "", middle: "", org: full }; // single token / company w/o flag
  return { last, first, middle, org: "" };
}
// CSV: quote every field, escape embedded quotes; empty -> empty (NULL via FORCE_NULL not used; '' is fine)
const q = (v) => { const s = v == null ? "" : String(v); return '"' + s.replace(/"/g, '""') + '"'; };
const row = (...vals) => vals.map(q).join(",") + "\n";

const OFFICER_STARTS = [669, 797, 925, 1053, 1181, 1309]; // 6 blocks, 128 chars each

function parseRecord(s, out) {
  const num = F(s, 1, 12), name = F(s, 13, 192);
  if (!num || !name) return;
  const ftype = F(s, 206, 15);
  const status = F(s, 205, 1) === "A" ? "Active" : "Inactive";
  const etype = ENTITY_TYPE[ftype] || ftype;
  const filed = pdate(F(s, 473, 8));
  const soi = F(s, 504, 2) || "FL";
  // entities: name,num,initial_filing_date,jurisdiction,status,type,filing_type,p_addr1,p_addr2,p_city,p_state,p_postal,juris
  out.ent.write(row(name, num, filed, soi, status, etype, ftype,
    F(s, 221, 42), F(s, 263, 42), F(s, 305, 28), F(s, 333, 2), F(s, 335, 10), "FL"));
  // registered agent: name(545-586) type(587) addr(588-629) city(630-657) state(658-659) zip(660-668)
  const raField = RAW(s, 545, 42);
  if (raField.trim()) {
    const nm = pname(raField, F(s, 587, 1));
    out.ag.write(row(name, num, nm.org, nm.first, nm.middle, nm.last,
      F(s, 588, 42), F(s, 630, 28), F(s, 658, 2), F(s, 660, 9), "Registered Agent", "FL"));
  }
  // officers (up to 6): title(4) type(1) name(42) addr(42) city(28) state(2) zip(9)
  for (const st of OFFICER_STARTS) {
    const nmField = RAW(s, st + 5, 42);
    if (!nmField.trim()) continue;
    const nm = pname(nmField, F(s, st + 4, 1));
    if (!nm) continue;
    // principals: name,num,org_name,first,middle,last,position_type,addr1,city,state,postal,juris
    out.prin.write(row(name, num, nm.org, nm.first, nm.middle, nm.last,
      F(s, st, 4), F(s, st + 47, 42), F(s, st + 89, 28), F(s, st + 117, 2), F(s, st + 119, 9), "FL"));
  }
}

async function parseAll() {
  fs.mkdirSync(OUT, { recursive: true });
  const out = {
    ent: fs.createWriteStream(path.join(OUT, "be_entities.csv")),
    prin: fs.createWriteStream(path.join(OUT, "be_principals.csv")),
    ag: fs.createWriteStream(path.join(OUT, "be_agents.csv")),
  };
  let total = 0;
  const LIMIT = Number(process.env.LIMIT) || 0; // testing: stop after N records
  for (let i = 0; i < 10; i++) {
    const fname = `cordata${i}.txt`;
    const s0 = Date.now();
    log(`parse ${fname}`);
    const child = spawn(UNZIP, ["-p", ZIP, fname], { stdio: ["ignore", "pipe", "ignore"] });
    child.stdout.setEncoding("latin1");
    const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    let n = 0;
    for await (const line of rl) {
      if (line.length < 1440) continue;
      parseRecord(line, out);
      // backpressure: if the big (principals) stream fills, wait for it to drain
      if (out.prin.writableLength > (1 << 24)) await new Promise((r) => out.prin.once("drain", r));
      n++; total++;
      if (n % 500000 === 0) log(`  ${fname}: ${n.toLocaleString()}`);
      if (LIMIT && total >= LIMIT) { rl.close(); child.kill(); break; }
    }
    if (LIMIT && total >= LIMIT) { log(`  (stopped at LIMIT=${LIMIT})`); break; }
    log(`  ${fname}: ${n.toLocaleString()} records in ${((Date.now() - s0) / 1000).toFixed(0)}s`);
  }
  for (const w of Object.values(out)) { w.end(); await new Promise((r) => w.on("finish", r)); }
  log(`PARSE DONE: ${total.toLocaleString()} entities -> CSVs in ${OUT}`);
}

async function copyInto(table, cols, file) {
  const s0 = Date.now();
  log(`COPY ${table} <- ${path.basename(file)}`);
  const cleanUrl = URL.replace(/([?&])sslmode=[^&]*/gi, "$1").replace(/[?&]+$/, "");
  const client = new pg.Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false }, keepAlive: true });
  await client.connect();
  try {
    const stream = client.query(copyFrom(`COPY ${table} (${cols}) FROM STDIN WITH (FORMAT csv)`));
    await pipeline(fs.createReadStream(file, { highWaterMark: 1 << 20 }), stream);
  } finally { await client.end(); }
  const r = await sql.unsafe(`SELECT count(*)::bigint c FROM ${table} WHERE juris='FL'`);
  log(`  ${table}: ${Number(r[0].c).toLocaleString()} FL rows (${((Date.now() - s0) / 1000).toFixed(0)}s)`);
}

async function loadAll() {
  log("Clearing prior juris='FL' rows");
  await sql.unsafe("DELETE FROM be_entities WHERE juris='FL'; DELETE FROM be_principals WHERE juris='FL'; DELETE FROM be_agents WHERE juris='FL'");
  await copyInto("be_entities", "entity_name,entity_num,initial_filing_date,jurisdiction,entity_status,entity_type,filing_type,principal_addr1,principal_addr2,principal_city,principal_state,principal_postal,juris", path.join(OUT, "be_entities.csv"));
  await copyInto("be_principals", "entity_name,entity_num,org_name,first_name,middle_name,last_name,position_type,addr1,city,state,postal_code,juris", path.join(OUT, "be_principals.csv"));
  await copyInto("be_agents", "entity_name,entity_num,org_name,first_name,middle_name,last_name,addr1,city,state,postal_code,agent_type,juris", path.join(OUT, "be_agents.csv"));
}

try {
  if (phase === "all" || phase === "parse") await parseAll();
  if (phase === "all" || phase === "load") await loadAll();
  log("ALL DONE ✅");
} catch (e) { log("ABORTED: " + (e.stack || e.message)); process.exitCode = 1; } finally { await sql.end(); }
