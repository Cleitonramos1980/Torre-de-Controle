/**
 * VALIDAÇÃO READ-ONLY: NFS-e Tomadas ADN x WinThor
 * Cruza notas do ADN nacional com PCLANC, PCNFENT, PCFORNEC
 * Não altera nenhum dado.
 */
import oracledb from "oracledb";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";

// ─── Config ──────────────────────────────────────────────────────────────────
const env = readFileSync("C:/TorreControle/.env", "utf8");
const getEnv = (key) => env.match(new RegExp(`^${key}=(.+)`, "m"))?.[1]?.trim() ?? "";

const ORA_USER   = getEnv("ORACLE_USER");
const ORA_PASS   = getEnv("ORACLE_PASSWORD");
const ORA_CS     = getEnv("ORACLE_CONNECT_STRING");
const JWT_SECRET = getEnv("JWT_SECRET_KEY");

// ─── JWT helper ──────────────────────────────────────────────────────────────
function makeToken() {
    const h   = Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url");
    const ts  = Math.floor(Date.now()/1000);
    const pay = Buffer.from(JSON.stringify({sub:"admin",username:"admin",role:"ADMIN",iat:ts,exp:ts+3600})).toString("base64url");
    const sig = createHmac("sha256", JWT_SECRET).update(`${h}.${pay}`).digest("base64url");
    return `${h}.${pay}.${sig}`;
}

function fetchApi(path) {
    return new Promise((res, rej) => {
        const req = http.request(
            { hostname:"localhost", port:3333, path, method:"GET",
              headers:{"Authorization":`Bearer ${makeToken()}`} },
            r => { const c=[]; r.on("data",d=>c.push(d)); r.on("end",()=>res(JSON.parse(Buffer.concat(c).toString()))); }
        );
        req.on("error", rej);
        req.end();
    });
}

// ─── Oracle helper ───────────────────────────────────────────────────────────
let pool;
async function query(sql, binds=[]) {
    const conn = await pool.getConnection();
    try {
        const r = await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return r.rows;
    } finally {
        await conn.close();
    }
}

function limparCnpj(v) { return String(v||"").replace(/\D/g,""); }
function moeda(v) { return `R$ ${Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`; }

// ─── Main ────────────────────────────────────────────────────────────────────
console.log("=".repeat(80));
console.log("  VALIDAÇÃO NFS-e TOMADAS ADN x WINTHOR — READ-ONLY");
console.log("  Data:", new Date().toLocaleString("pt-BR"));
console.log("=".repeat(80));
console.log();

// 1. Conectar Oracle
console.log("Conectando ao Oracle...");
pool = await oracledb.createPool({
    user: ORA_USER, password: ORA_PASS, connectString: ORA_CS,
    poolMin:1, poolMax:3, poolIncrement:1, poolAlias:"valPool"
});
console.log("Oracle conectado.\n");

// 2. Buscar NFS-e Tomadas do backend (já filtradas pelo mês vigente)
//    Para validação completa, buscamos todas (sem filtro de competência)
console.log("Carregando NFS-e Tomadas do ADN (todas as notas)...");
const allTomadas = [];
let page = 1;
let total = Infinity;
while (allTomadas.length < total) {
    const resp = await fetchApi(`/api/fiscal/nfse/tomadas?page=${page}&pageSize=100`);
    total = resp.total;
    allTomadas.push(...resp.items);
    page++;
    if (resp.items.length === 0) break;
}

const adnNotes = allTomadas.filter(t => t.origem === "ADN_NACIONAL" && t.nsuAdn > 0);
console.log(`Total NFS-e Tomadas ADN: ${adnNotes.length}`);
console.log();

// 3. Buscar fornecedores do WinThor com CNPJ
console.log("Consultando PCFORNEC (fornecedores)...");
const fornRows = await query(`
    SELECT CODFORNEC, FORNECEDOR, TRIM(CGC) AS CGC
    FROM PCFORNEC
    WHERE CGC IS NOT NULL AND CGC != ' '
    AND ROWNUM <= 50000
`);

// Indexar por CNPJ limpo
const fornPorCnpj = new Map();
for (const r of fornRows) {
    const cnpj = limparCnpj(r.CGC);
    if (cnpj.length === 14 || cnpj.length === 11) {
        if (!fornPorCnpj.has(cnpj)) fornPorCnpj.set(cnpj, []);
        fornPorCnpj.get(cnpj).push({ cod: r.CODFORNEC, nome: r.FORNECEDOR });
    }
}
console.log(`PCFORNEC: ${fornRows.length} fornecedores com CNPJ\n`);

// 4. Buscar lançamentos PCLANC dos últimos 3 anos
console.log("Consultando PCLANC (lançamentos de serviço)...");
const lancRows = await query(`
    SELECT l.RECNUM, l.CODFORNEC, l.VALOR, l.DTLANC,
           TRIM(l.NUMNOTA)       AS NUMNOTA,
           TRIM(l.HISTORICO)     AS HISTORICO,
           TRIM(l.NFSERVICO)     AS NFSERVICO,
           TRIM(l.SERIE)         AS SERIE,
           l.DTEMISSAO, l.DTCOMPETENCIA,
           TRIM(l.FORNECEDOR)    AS FORNECEDOR
    FROM PCLANC l
    WHERE l.DTLANC >= ADD_MONTHS(SYSDATE, -36)
    AND l.CODFORNEC IS NOT NULL
    AND l.VALOR > 0
`);
console.log(`PCLANC: ${lancRows.length} lançamentos encontrados\n`);

// Indexar PCLANC por CODFORNEC → lista de lançamentos
const lancPorFornec = new Map();
for (const r of lancRows) {
    const cod = Number(r.CODFORNEC);
    if (!lancPorFornec.has(cod)) lancPorFornec.set(cod, []);
    lancPorFornec.get(cod).push({
        recnum:  r.RECNUM,
        numnota: String(r.NUMNOTA || "").trim(),
        valor:   Number(r.VALOR || 0),
        dt:      r.DTLANC ? String(r.DTLANC).slice(0,10) : "",
        dtEmi:   r.DTEMISSAO ? String(r.DTEMISSAO).slice(0,10) : "",
        dtComp:  r.DTCOMPETENCIA ? String(r.DTCOMPETENCIA).slice(0,10) : "",
        hist:    String(r.HISTORICO || "").trim(),
        nfserv:  String(r.NFSERVICO || "").trim(),
        serie:   String(r.SERIE || "").trim(),
        forn:    String(r.FORNECEDOR || "").trim(),
    });
}

// 5. Buscar PCNFENT (notas fiscais de entrada — serviços podem estar aqui também)
console.log("Consultando PCNFENT (notas fiscais de entrada)...");
let nfentRows = [];
try {
    nfentRows = await query(`
        SELECT n.NUMNOTA, n.CODFORNEC, n.VLTOTAL, n.DTEMISSAO, n.DTENT,
               TRIM(n.ESPECIE) AS ESPECIE, TRIM(n.SERIE) AS SERIE,
               TRIM(n.CGC) AS CGC, TRIM(n.FORNECEDOR) AS FORNECEDOR,
               n.VLISS
        FROM PCNFENT n
        WHERE n.DTEMISSAO >= ADD_MONTHS(SYSDATE, -36)
        AND n.CODFORNEC IS NOT NULL
        AND n.VLTOTAL > 0
    `);
} catch(e) {
    console.log("  PCNFENT erro:", e.message.split("\n")[0]);
}
console.log(`PCNFENT: ${nfentRows.length} notas encontradas\n`);

// Indexar PCNFENT por CODFORNEC
const nfentPorFornec = new Map();
// Também indexar por CNPJ direto (PCNFENT tem CGC desnormalizado)
const nfentPorCnpj = new Map();
for (const r of nfentRows) {
    const cod  = Number(r.CODFORNEC);
    const cnpj = limparCnpj(r.CGC);
    const obj  = {
        numnota: String(r.NUMNOTA || "").trim(),
        valor:   Number(r.VLTOTAL || 0),
        dt:      r.DTEMISSAO ? String(r.DTEMISSAO).slice(0,10) : "",
        especie: String(r.ESPECIE || "").trim(),
        serie:   String(r.SERIE || "").trim(),
        codfornec: cod,
    };
    if (!nfentPorFornec.has(cod)) nfentPorFornec.set(cod, []);
    nfentPorFornec.get(cod).push(obj);
    if (cnpj.length >= 11) {
        if (!nfentPorCnpj.has(cnpj)) nfentPorCnpj.set(cnpj, []);
        nfentPorCnpj.get(cnpj).push(obj);
    }
}

// ─── 6. CRUZAMENTO ────────────────────────────────────────────────────────────
console.log("=".repeat(80));
console.log("  RESULTADO DO CRUZAMENTO");
console.log("=".repeat(80));
console.log();

const resultados = [];

for (const nota of adnNotes) {
    const cnpj     = limparCnpj(nota.cnpjPrestador);
    const numNfse  = String(nota.numeroNfse || "").trim();
    const valor    = Number(nota.valorServico || 0);
    const dataEmi  = nota.dataEmissao || "";
    const compet   = nota.competencia || "";

    // Encontrar fornecedor no WinThor
    const forns = fornPorCnpj.get(cnpj) || [];
    const temFornecedor = forns.length > 0;

    let achouLanc   = false;
    let achouNfent  = false;
    let matchLanc   = null;
    let matchNfent  = null;

    for (const forn of forns) {
        const cod  = Number(forn.cod);
        const lancs = lancPorFornec.get(cod) || [];

        // Tentativa 1: NUMNOTA bate exatamente com número da NFS-e
        const porNum = lancs.find(l =>
            l.numnota && numNfse &&
            (l.numnota === numNfse ||
             l.numnota.replace(/\D/g,"") === numNfse.replace(/\D/g,"") ||
             l.numnota.replace(/^0+/,"") === numNfse.replace(/^0+/,""))
        );
        if (porNum) { achouLanc = true; matchLanc = { ...porNum, codfornec: cod, fornecedor: forn.nome, matchType: "NUMNOTA" }; break; }

        // Tentativa 2: valor igual (tolerância 1%) no mesmo mês de competência
        const porValor = valor > 0 ? lancs.find(l =>
            Math.abs(l.valor - valor) / valor < 0.01 &&
            compet && l.dt && l.dt.slice(0,7) === compet
        ) : null;
        if (porValor) { achouLanc = true; matchLanc = { ...porValor, codfornec: cod, fornecedor: forn.nome, matchType: "VALOR+MES" }; break; }

        // Tentativa 3: PCNFENT por número de nota
        const nfents = nfentPorFornec.get(cod) || [];
        const porNfCod = nfents.find(n =>
            n.numnota && numNfse &&
            (n.numnota === numNfse || n.numnota.replace(/\D/g,"") === numNfse.replace(/\D/g,""))
        );
        if (porNfCod) { achouNfent = true; matchNfent = { ...porNfCod, codfornec: cod, fornecedor: forn.nome, matchType: "PCNFENT_NUM" }; break; }
    }

    // Tentativa 4: match direto por CNPJ no PCNFENT (CGC desnormalizado)
    if (!achouLanc && !achouNfent) {
        const nfentsCnpj = nfentPorCnpj.get(cnpj) || [];
        const porNfCnpj = nfentsCnpj.find(n =>
            n.numnota && numNfse &&
            (n.numnota === numNfse || n.numnota.replace(/\D/g,"") === numNfse.replace(/\D/g,""))
        );
        if (porNfCnpj) { achouNfent = true; matchNfent = { ...porNfCnpj, fornecedor: forns[0]?.nome || "", matchType: "PCNFENT_CNPJ" }; }
    }

    const situacao = !temFornecedor  ? "SEM_FORNECEDOR_WINTHOR"
                   : achouLanc       ? "LANCADO_PCLANC"
                   : achouNfent      ? "LANCADO_PCNFENT"
                   :                   "NAO_LANCADO";

    resultados.push({
        nsu: nota.nsuAdn,
        numeroNfse: numNfse,
        nomePrestador: nota.nomePrestador || "",
        cnpj,
        valor,
        dataEmissao: dataEmi,
        competencia: compet,
        situacao,
        temFornecedor,
        codfornec: (matchLanc || matchNfent)?.codfornec || (forns[0]?.cod ?? null),
        fornecedorWinthor: (matchLanc || matchNfent)?.fornecedor || (forns[0]?.nome ?? null),
        matchLanc,
        matchNfent,
    });
}

// ─── 7. RELATÓRIO ─────────────────────────────────────────────────────────────
const grupos = {
    LANCADO_PCLANC:        resultados.filter(r => r.situacao === "LANCADO_PCLANC"),
    LANCADO_PCNFENT:       resultados.filter(r => r.situacao === "LANCADO_PCNFENT"),
    NAO_LANCADO:           resultados.filter(r => r.situacao === "NAO_LANCADO"),
    SEM_FORNECEDOR_WINTHOR:resultados.filter(r => r.situacao === "SEM_FORNECEDOR_WINTHOR"),
};

console.log("RESUMO GERAL:");
console.log(`  Total NFS-e ADN analisadas       : ${adnNotes.length}`);
console.log(`  ✅ Lançadas no PCLANC            : ${grupos.LANCADO_PCLANC.length}`);
console.log(`  ✅ Lançadas no PCNFENT           : ${grupos.LANCADO_PCNFENT.length}`);
console.log(`  ❌ NÃO LANÇADAS (fornec. existe) : ${grupos.NAO_LANCADO.length}`);
console.log(`  ⚠️  Fornecedor não existe no WinThor: ${grupos.SEM_FORNECEDOR_WINTHOR.length}`);
console.log();

// Detalhe das NÃO LANÇADAS (mais crítico)
if (grupos.NAO_LANCADO.length > 0) {
    console.log("=".repeat(80));
    console.log("  ❌ NFS-e NÃO LANÇADAS NO WINTHOR (fornecedor existe mas não há lançamento)");
    console.log("=".repeat(80));
    console.log();

    // Agrupar por competência
    const porCompet = new Map();
    for (const r of grupos.NAO_LANCADO) {
        if (!porCompet.has(r.competencia)) porCompet.set(r.competencia, []);
        porCompet.get(r.competencia).push(r);
    }

    for (const [compet, notas] of [...porCompet.entries()].sort()) {
        const totalCompet = notas.reduce((s,n)=>s+n.valor,0);
        console.log(`  📅 Competência: ${compet} — ${notas.length} nota(s) — Total: ${moeda(totalCompet)}`);
        for (const n of notas.sort((a,b)=>b.valor-a.valor)) {
            console.log(`     NSU ${String(n.nsu).padStart(5)} | NFS-e ${n.numeroNfse.padEnd(20)} | ${moeda(n.valor).padEnd(18)} | CODFOR: ${n.codfornec} | ${n.nomePrestador}`);
        }
        console.log();
    }
}

// Detalhe de SEM FORNECEDOR
if (grupos.SEM_FORNECEDOR_WINTHOR.length > 0) {
    console.log("=".repeat(80));
    console.log("  ⚠️  NFS-e COM CNPJ NÃO CADASTRADO NO WINTHOR (PCFORNEC)");
    console.log("=".repeat(80));
    console.log();

    // Agrupar por CNPJ para evitar repetição
    const porCnpj = new Map();
    for (const r of grupos.SEM_FORNECEDOR_WINTHOR) {
        if (!porCnpj.has(r.cnpj)) porCnpj.set(r.cnpj, []);
        porCnpj.get(r.cnpj).push(r);
    }

    for (const [cnpj, notas] of [...porCnpj.entries()].sort()) {
        const totalCnpj = notas.reduce((s,n)=>s+n.valor,0);
        const nome = notas[0].nomePrestador;
        const cnpjFmt = cnpj.length===14
            ? `${cnpj.slice(0,2)}.${cnpj.slice(2,5)}.${cnpj.slice(5,8)}/${cnpj.slice(8,12)}-${cnpj.slice(12)}`
            : cnpj;
        console.log(`  CNPJ: ${cnpjFmt} — ${nome}`);
        console.log(`         ${notas.length} nota(s) — Total: ${moeda(totalCnpj)} — Competências: ${[...new Set(notas.map(n=>n.competencia))].sort().join(", ")}`);
        if (notas.length <= 5) {
            for (const n of notas) {
                console.log(`         NSU ${n.nsu} | NFS-e ${n.numeroNfse} | ${moeda(n.valor)} | ${n.dataEmissao}`);
            }
        }
        console.log();
    }
}

// Resumo por competência das não lançadas
console.log("=".repeat(80));
console.log("  RESUMO POR COMPETÊNCIA — NÃO LANÇADAS");
console.log("=".repeat(80));
const naoLanc = [...grupos.NAO_LANCADO, ...grupos.SEM_FORNECEDOR_WINTHOR];
const porCompetGeral = new Map();
for (const r of naoLanc) {
    if (!porCompetGeral.has(r.competencia)) porCompetGeral.set(r.competencia, {count:0, total:0, semFornec:0});
    const g = porCompetGeral.get(r.competencia);
    g.count++;
    g.total += r.valor;
    if (r.situacao === "SEM_FORNECEDOR_WINTHOR") g.semFornec++;
}

console.log();
console.log(`  ${"Competência".padEnd(12)} ${"Qtde".padStart(6)} ${"Sem Fornec".padStart(12)} ${"Valor Total".padStart(18)}`);
console.log("  " + "-".repeat(52));
for (const [compet, g] of [...porCompetGeral.entries()].sort()) {
    console.log(`  ${compet.padEnd(12)} ${String(g.count).padStart(6)} ${String(g.semFornec).padStart(12)} ${moeda(g.total).padStart(18)}`);
}
console.log();

// Total geral pendente
const totalPendente = naoLanc.reduce((s,r)=>s+r.valor,0);
console.log(`  TOTAL PENDENTE: ${moeda(totalPendente)} em ${naoLanc.length} notas`);
console.log();

await pool.close();
console.log("=".repeat(80));
console.log("  FIM DA VALIDAÇÃO");
console.log("=".repeat(80));
