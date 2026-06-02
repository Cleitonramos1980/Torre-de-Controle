import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import path from "node:path";
import fs from "node:fs";
import https from "node:https";
import { randomUUID } from "node:crypto";

puppeteerExtra.use(StealthPlugin());

const BASE        = process.env.REDE_PORTAL_URL    || "https://meu.userede.com.br";
const EMAIL       = process.env.REDE_PORTAL_EMAIL  || "";
const SENHA       = process.env.REDE_PORTAL_SENHA  || "";
const CHROME_PATH = process.env.REDE_PORTAL_CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DOWNLOAD_DIR = process.env.REDE_PORTAL_DOWNLOAD_DIR || "C:\\TorreControle\\backend\\uploads\\rede-relatorios";
const DEBUG_DIR    = path.join(DOWNLOAD_DIR, "debug");

const ARGS = [
    "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
    "--window-size=1280,900",
];

function hoje() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function nomeArquivo(data) {
    return `rede_recebimentos_${data}.xlsx`;
}

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function screenshot(page, nome, log) {
    try {
        if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });
        const p = path.join(DEBUG_DIR, `${nome}_${Date.now()}.png`);
        await page.screenshot({ path: p, fullPage: false });
        log.info({ path: p }, `redePortalScraper: screenshot ${nome}`);
    } catch {}
}

async function clicarTexto(page, texto) {
    return page.evaluate((txt) => {
        for (const el of document.querySelectorAll("*")) {
            if (el.children.length === 0 && el.textContent.trim().toLowerCase().includes(txt.toLowerCase())) {
                let p = el; let t = 0;
                while (p && !['A','BUTTON'].includes(p.tagName) && t++ < 6) p = p.parentElement;
                (p || el).click(); return true;
            }
        }
        return false;
    }, texto);
}

function baixarArquivo(url, destino, jwt, cookies) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        // S3 pre-signed URLs já contêm autenticação nos query params — headers de auth causam 400
        const isS3Presigned = url.includes(".amazonaws.com") && url.includes("X-Amz-");
        const opts = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            headers: isS3Presigned ? {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
                "Accept": "application/octet-stream, */*",
            } : {
                Authorization: `Bearer ${jwt}`,
                authorizationrede: `Bearer ${jwt}`,
                Cookie: cookies,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
                "Accept": "application/octet-stream, */*",
            }
        };
        const out = fs.createWriteStream(destino);
        https.get(opts, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                out.close();
                return baixarArquivo(res.headers.location, destino, jwt, cookies).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                out.close();
                return reject(new Error(`Download HTTP ${res.statusCode}`));
            }
            res.pipe(out);
            out.on("finish", () => { out.close(); resolve(destino); });
            res.on("error", reject);
        }).on("error", reject);
    });
}

// Detecta novo arquivo .xlsx/.xls/.csv no diretório (excluindo .crdownload e pré-existentes)
function _novoArquivoXls(dir, filesAntes) {
    if (!fs.existsSync(dir)) return null;
    const novos = fs.readdirSync(dir).filter(
        f => !f.endsWith('.crdownload') &&
             !filesAntes.has(f) &&
             /\.(xlsx|xls|csv)$/i.test(f)
    );
    return novos.length > 0 ? path.join(dir, novos[0]) : null;
}

// Busca recursivamente qualquer string que pareça URL de download em qualquer campo do objeto
function _extrairUrlDownload(obj, depth = 0) {
    if (depth > 8) return null;
    if (typeof obj === 'string') {
        if (/^https?:\/\/.{30,}/.test(obj)) return obj;
        return null;
    }
    if (Array.isArray(obj)) {
        for (const v of obj) { const u = _extrairUrlDownload(v, depth + 1); if (u) return u; }
    } else if (obj && typeof obj === 'object') {
        for (const v of Object.values(obj)) { const u = _extrairUrlDownload(v, depth + 1); if (u) return u; }
    }
    return null;
}

export async function baixarRelatorioRede(logger) {
    const log = logger || console;
    const data = hoje();
    const destino = path.join(DOWNLOAD_DIR, nomeArquivo(data));

    if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    log.info({ data }, "redePortalScraper: iniciando");

    const browser = await puppeteerExtra.launch({
        executablePath: CHROME_PATH,
        headless: "new",
        args: ARGS,
    });

    let jwtToken = null;
    let xGuid    = null;
    let queueItemsIntercepted = [];

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' });

        // CDP: redireciona downloads automáticos do Chrome para DOWNLOAD_DIR
        try {
            const cdpClient = await page.target().createCDPSession();
            await cdpClient.send('Page.setDownloadBehavior', {
                behavior: 'allow',
                downloadPath: path.resolve(DOWNLOAD_DIR)
            });
            log.info({ downloadPath: path.resolve(DOWNLOAD_DIR) }, "redePortalScraper: CDP download behavior configurado");
        } catch (cdpErr) {
            log.warn({ cdpErr }, "redePortalScraper: falha ao configurar CDP download (continuando)");
        }

        // Snapshot dos arquivos existentes para detectar novos downloads
        const filesAntes = new Set(
            fs.readdirSync(DOWNLOAD_DIR).filter(f => !f.endsWith('.crdownload'))
        );

        // Captura JWT do login
        page.on("response", async res => {
            try {
                if (res.url().includes("/api/lm1/v3/login") && res.status() === 200) {
                    const b = await res.json().catch(() => null);
                    if (b?.token) jwtToken = b.token;
                }
                // Intercepta respostas da fila de downloads
                if (res.url().includes("/downloads/queue") && res.status() === 200) {
                    const b = await res.json().catch(() => null);
                    if (b) {
                        const items = Array.isArray(b) ? b : (b.content || b.items || b.data || [b]);
                        const resumo = items.map(x => ({
                            status: x.status, origin: x.origin, ext: x.fileExtension,
                            hasUrl: !!_extrairUrlDownload(x),
                        }));
                        log.info({ count: items.length, items: resumo }, "redePortalScraper: queue interceptado");
                        // Loga objeto completo em estados finais (não 400/FETCHING/PROCESSING/ERROR)
                        items.forEach(x => {
                            const st = String(x.status || "").toUpperCase();
                            if (st !== "400" && st !== "FETCHING" && st !== "PROCESSING" && st !== "ERROR") {
                                log.info({ itemCompleto: x }, "redePortalScraper: queue item estado final");
                            }
                        });
                        // Também loga o body completo para não perder URL em campo inesperado
                        const urlIntercept = _extrairUrlDownload(b);
                        if (urlIntercept) log.info({ url: urlIntercept.substring(0, 120) }, "redePortalScraper: URL detectada no interceptor");
                        queueItemsIntercepted = [...queueItemsIntercepted, ...items];
                    }
                }
            } catch {}
        });

        // Captura x-guid — prioriza downloads/queue, fallback para qualquer /api/
        page.on("request", req => {
            const xg = req.headers()["x-guid"];
            if (xg) {
                const isQueue = req.url().includes("/downloads/queue");
                if (isQueue || !xGuid) {
                    xGuid = xg;
                    if (isQueue) log.info({ xGuid: xg, url: req.url().substring(0,80) }, "redePortalScraper: x-guid capturado (queue)");
                }
            }
        });

        // LOGIN
        log.info("redePortalScraper: login");
        await page.goto(`${BASE}/login`, { waitUntil: "networkidle2", timeout: 60000 });
        await wait(3000);
        await clicarTexto(page, "acessar conta");
        await wait(3000);
        await page.waitForSelector("#ids-input-0", { timeout: 10000 });
        await page.click("#ids-input-0"); await page.type("#ids-input-0", EMAIL, { delay: 80 });
        await page.click("#ids-input-1"); await page.type("#ids-input-1", SENHA, { delay: 80 });
        await wait(1000);
        await page.evaluate(() => {
            [...document.querySelectorAll("button")].find(b => b.textContent.trim().toLowerCase() === "acessar")?.click();
        });
        await wait(8000);
        if (!jwtToken) throw new Error("JWT não capturado após login");
        log.info({ xGuid }, "redePortalScraper: login OK");

        // RELATÓRIO
        await page.goto(`${BASE}/i/relatorio/recebimentos`, { waitUntil: "networkidle2", timeout: 60000 });
        await wait(5000);
        // Aguarda o React renderizar o conteúdo (até 40s)
        await page.waitForFunction(
            () => {
                const txt = (document.body.innerText || "").toLowerCase();
                return txt.includes("recebimento") || txt.includes("exportar") || txt.includes("excel");
            },
            { timeout: 40000, polling: 2000 }
        ).catch(() => null);
        await wait(3000);
        log.info({ xGuid }, "redePortalScraper: página de recebimentos carregada");
        await screenshot(page, "00_recebimentos", log);

        // Fecha popup tutorial
        const fechouTutorial = await clicarTexto(page, "agora não, obrigado");
        log.info({ fechouTutorial }, "redePortalScraper: tutorial popup");
        await wait(2000);

        // Abre modal Excel — clica especificamente no link dentro de "exportar relatório"
        const clicouExcel = await page.evaluate(() => {
            const normalize = s => s.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
            // Tenta achar "exportar relatório" e clicar no Excel dentro dele
            for (const el of document.querySelectorAll("*")) {
                if (el.children.length === 0 && normalize(el.textContent?.trim() || "").includes("exportar relatorio")) {
                    let container = el;
                    for (let i = 0; i < 8; i++) {
                        if (!container) break;
                        for (const a of container.querySelectorAll("a, button")) {
                            if (normalize(a.textContent?.trim() || "") === "excel") {
                                a.scrollIntoView();
                                a.click();
                                return "via-exportar-relatorio";
                            }
                        }
                        container = container.parentElement;
                    }
                }
            }
            // Fallback: clica em qualquer <a> ou <button> com texto exatamente "Excel"
            for (const el of document.querySelectorAll("a, button")) {
                if (normalize(el.textContent?.trim() || "") === "excel") {
                    el.scrollIntoView();
                    el.click();
                    return "via-fallback";
                }
            }
            return null;
        });
        log.info({ clicouExcel }, "redePortalScraper: clicou Excel");
        await wait(8000);
        await screenshot(page, "01_apos_excel", log);

        // Verifica se Excel iniciou download direto (via CDP) — sem modal
        const arqDireto1 = _novoArquivoXls(DOWNLOAD_DIR, filesAntes);
        if (arqDireto1) {
            log.info({ arquivo: arqDireto1 }, "redePortalScraper: download direto detectado após Excel click");
            if (arqDireto1 !== destino) {
                if (fs.existsSync(destino)) fs.unlinkSync(destino);
                fs.renameSync(arqDireto1, destino);
            }
            await browser.close();
            const stat = fs.statSync(destino);
            log.info({ arquivo: destino, bytes: stat.size }, "redePortalScraper: download concluído (direto)");
            return { ok: true, arquivo: destino, data, bytes: stat.size };
        }

        // Captura textos visíveis para diagnóstico
        const textosPagina = await page.evaluate(() => {
            const texts = [];
            document.querySelectorAll("button, [role='button'], [role='radio'], [role='dialog'], input[type='radio'], label, h1, h2, h3, h4, span, div").forEach(el => {
                const t = el.textContent?.trim();
                if (t && t.length > 2 && t.length < 120 && el.children.length === 0) texts.push(t);
            });
            return [...new Set(texts)].slice(0, 80);
        });
        log.info({ textos: textosPagina }, "redePortalScraper: textos visíveis após Excel");

        // Seleciona tipo de relatório — tenta "detalhado" e variações conhecidas
        const clicouDetalhado = await page.evaluate(() => {
            const normalize = s => s.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
            const termos = ["relatorio detalhado", "detalhado de recebimentos", "detalhado"];
            for (const termo of termos) {
                for (const el of document.querySelectorAll("*")) {
                    if (el.children.length === 0) {
                        const txt = normalize(el.textContent?.trim() || "");
                        if (txt === termo || txt.includes(termo)) {
                            el.click();
                            el.parentElement?.click();
                            return el.textContent?.trim();
                        }
                    }
                }
            }
            // Tenta clicar em radio buttons ou opções de tipo de relatório
            for (const el of document.querySelectorAll("input[type='radio'], [role='radio']")) {
                const label = el.labels?.[0] || el.closest("label") || el.parentElement;
                const txt = normalize(label?.textContent?.trim() || "");
                if (txt.includes("detalhado")) {
                    el.click();
                    return txt;
                }
            }
            return null;
        });
        log.info({ clicouDetalhado }, "redePortalScraper: seleção relatório detalhado");
        await wait(2000);
        await screenshot(page, "02_apos_detalhado", log);

        // Clica "gerar arquivo para baixar" - tenta múltiplas variações
        const resultadoGerar = await page.evaluate(() => {
            const normalize = s => s.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
            const termos = ["gerar arquivo para baixar", "gerar arquivo", "gerar relatorio", "gerar", "baixar", "exportar arquivo"];
            for (const termo of termos) {
                for (const el of document.querySelectorAll("button, a, [role='button']")) {
                    if (normalize(el.textContent?.trim() || "").includes(normalize(termo))) {
                        el.click();
                        return { clicado: true, texto: el.textContent?.trim(), termo };
                    }
                }
            }
            // Log todos os botões visíveis
            const btns = [...document.querySelectorAll("button, a, [role='button']")]
                .map(b => b.textContent?.trim()).filter(t => t && t.length > 0 && t.length < 80);
            return { clicado: false, botoesVisiveis: [...new Set(btns)].slice(0, 30) };
        });
        log.info({ resultadoGerar }, "redePortalScraper: gerar arquivo");
        await wait(5000);
        await screenshot(page, "03_apos_gerar", log);

        // x-guid fallback: tenta pegar do localStorage/sessionStorage
        if (!xGuid) {
            xGuid = await page.evaluate(() => {
                for (const storage of [localStorage, sessionStorage]) {
                    for (let i = 0; i < storage.length; i++) {
                        const k = storage.key(i);
                        const v = storage.getItem(k);
                        if (v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return v;
                    }
                }
                return null;
            });
            log.info({ xGuid }, "redePortalScraper: x-guid do storage (fallback)");
        }

        const guid = xGuid || randomUUID();
        log.info({ guid, xGuidCapturado: !!xGuid }, "redePortalScraper: iniciando polling da fila");

        let downloadLink = null;

        // A Rede pode levar até ~30 min para gerar o arquivo (PT27M28S observado)
        // 500 × 4s = 2000s ≈ 33 min — cobre geração fresh com margem
        for (let i=0; i<500; i++) {
            await wait(4000);

            // 0) Verifica download direto (CDP) — caso Chrome baixe sem passar pela fila
            const arqDireto = _novoArquivoXls(DOWNLOAD_DIR, filesAntes);
            if (arqDireto) {
                log.info({ arquivo: arqDireto, poll: i+1 }, "redePortalScraper: download direto detectado no polling");
                if (arqDireto !== destino) {
                    if (fs.existsSync(destino)) fs.unlinkSync(destino);
                    fs.renameSync(arqDireto, destino);
                }
                await browser.close();
                const stat = fs.statSync(destino);
                log.info({ arquivo: destino, bytes: stat.size }, "redePortalScraper: download concluído (direto)");
                return { ok: true, arquivo: destino, data, bytes: stat.size };
            }

            // 1) Verifica itens interceptados — busca URL em qualquer campo recursivamente
            const prontoIntercepted = queueItemsIntercepted.find(x => !!_extrairUrlDownload(x));
            if (prontoIntercepted) {
                downloadLink = _extrairUrlDownload(prontoIntercepted);
                log.info({ source: "intercepted", url: downloadLink?.substring(0, 120), item: prontoIntercepted }, "redePortalScraper: URL encontrada via interceptor");
                break;
            }

            // 2) Poll manual
            const r = await page.evaluate(async (jwt, xg) => {
                try {
                    const res = await fetch("/api/fl2/prd/v1/downloads/queue", {
                        headers: {
                            Authorization: `Bearer ${jwt}`,
                            authorizationrede: `Bearer ${jwt}`,
                            "x-guid": xg,
                            "x-reqid": crypto.randomUUID(),
                            Accept: "application/json, text/plain, */*",
                        }
                    });
                    const text = await res.text();
                    return { status: res.status, body: text };
                } catch(e) { return { status: 0, body: e.message }; }
            }, jwtToken, guid);

            if (r.status !== 200) {
                if (i % 5 === 0) log.warn({ poll: i+1, status: r.status, body: r.body.substring(0,200) }, "redePortalScraper: fila http erro");
                continue;
            }

            let itens;
            try {
                const parsed = JSON.parse(r.body);
                // Body pode ter status:400 mesmo com HTTP 200
                if (parsed?.status === 400 || parsed?.error) {
                    if (i % 5 === 0) log.warn({ poll: i+1, body: r.body.substring(0,200) }, "redePortalScraper: fila body erro");
                    continue;
                }
                itens = Array.isArray(parsed) ? parsed : (parsed.content || parsed.items || parsed.data || [parsed]);
            } catch { continue; }

            const resumo = itens.map(x => ({
                status: x.status,
                origin: x.origin,
                ext: x.fileExtension,
                remaining: x.timeRemaining,
                hasUrl: !!_extrairUrlDownload(x),
            }));
            log.info({ poll: i+1, count: itens.length, itens: resumo }, "redePortalScraper: poll");
            // Loga item completo em estados finais
            itens.forEach(x => {
                const st = String(x.status || "").toUpperCase();
                if (st !== "400" && st !== "FETCHING" && st !== "PROCESSING" && st !== "ERROR") {
                    log.info({ itemCompleto: x }, "redePortalScraper: poll item estado final");
                }
            });

            // Busca URL recursivamente em qualquer campo do item
            const pronto = itens.find(x => !!_extrairUrlDownload(x));
            if (pronto) {
                downloadLink = _extrairUrlDownload(pronto);
                log.info({ source: "poll", url: downloadLink?.substring(0, 120), item: pronto }, "redePortalScraper: item pronto");
                break;
            }

            // Busca URL também no body completo (cobre estruturas aninhadas não extraídas em itens)
            const urlNoBody = _extrairUrlDownload(JSON.parse(r.body));
            if (urlNoBody) {
                downloadLink = urlNoBody;
                log.info({ poll: i+1, url: urlNoBody.substring(0, 120) }, "redePortalScraper: URL encontrada no body completo");
                break;
            }

            const itemErro = itens.find(x => x.status === "ERROR" || x.errorMessage);
            if (itemErro) throw new Error(`Erro na fila: ${itemErro.errorMessage || itemErro.status}`);

            // A cada 20 polls: scan do DOM para botão de download que possa ter aparecido na página
            if (i % 20 === 19) {
                await screenshot(page, `poll_${i+1}`, log);
                const domResult = await page.evaluate(() => {
                    // Detecta link direto para arquivo
                    for (const el of document.querySelectorAll('a[href]')) {
                        const href = el.href || '';
                        if (/\.(xlsx|xls|csv)/i.test(href) || href.includes('amazonaws.com') || href.includes('X-Amz-')) return href;
                    }
                    // Detecta botão de download e clica nele
                    const normalize = s => s.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
                    const termos = ["baixar arquivo", "clique aqui para baixar", "download pronto", "fazer download", "download"];
                    for (const termo of termos) {
                        for (const el of document.querySelectorAll('a, button, [role="button"]')) {
                            const txt = normalize(el.textContent?.trim() || '');
                            if (txt === normalize(termo) || txt.includes(normalize(termo))) {
                                const href = el.href || '';
                                if (href.startsWith('http')) { el.click(); return 'href:' + href; }
                                el.click();
                                return 'click:' + el.textContent?.trim();
                            }
                        }
                    }
                    return null;
                }).catch(() => null);
                if (domResult) {
                    log.info({ poll: i+1, domResult }, "redePortalScraper: DOM scan resultado");
                    if (domResult.startsWith('href:')) {
                        downloadLink = domResult.slice(5);
                        break;
                    }
                    // Se clicou botão, aguarda CDP capturar download ou URL aparecer
                    await wait(8000);
                    const arqDomClick = _novoArquivoXls(DOWNLOAD_DIR, filesAntes);
                    if (arqDomClick) {
                        if (arqDomClick !== destino) {
                            if (fs.existsSync(destino)) fs.unlinkSync(destino);
                            fs.renameSync(arqDomClick, destino);
                        }
                        await browser.close();
                        const stat = fs.statSync(destino);
                        log.info({ arquivo: destino, bytes: stat.size }, "redePortalScraper: download concluído (DOM click)");
                        return { ok: true, arquivo: destino, data, bytes: stat.size };
                    }
                }
            }
        }

        if (!downloadLink) throw new Error("Timeout aguardando URL de download da fila");

        const pageCookies = await page.cookies();
        const cookieStr   = pageCookies.map(c => `${c.name}=${c.value}`).join("; ");
        await browser.close();

        log.info({ url: downloadLink.substring(0,80) }, "redePortalScraper: baixando arquivo");
        if (fs.existsSync(destino)) fs.unlinkSync(destino);
        await baixarArquivo(downloadLink, destino, jwtToken, cookieStr);

        const stat = fs.statSync(destino);
        log.info({ arquivo: destino, bytes: stat.size }, "redePortalScraper: download concluído");
        return { ok: true, arquivo: destino, data, bytes: stat.size };

    } catch(err) {
        try { await browser.close(); } catch {}
        log.error({ err }, "redePortalScraper: falha");
        throw err;
    }
}

export function listarRelatorios() {
    if (!fs.existsSync(DOWNLOAD_DIR)) return [];
    return fs.readdirSync(DOWNLOAD_DIR)
        .filter(f => f.startsWith("rede_recebimentos_") && (f.endsWith(".xlsx") || f.endsWith(".xls") || f.endsWith(".csv")))
        .map(f => {
            const fp = path.join(DOWNLOAD_DIR, f);
            const stat = fs.statSync(fp);
            const data = f.replace("rede_recebimentos_", "").replace(/\.(xlsx|xls|csv)$/, "");
            return { nome: f, data, tamanhoBytes: stat.size, baixadoEm: stat.mtime.toISOString(), caminho: fp };
        })
        .sort((a, b) => b.data.localeCompare(a.data));
}

export function caminhoRelatorio(nome) {
    const fp = path.join(DOWNLOAD_DIR, path.basename(nome));
    if (!fs.existsSync(fp)) return null;
    return fp;
}

export function agendarDownloadDiario(hora, logger, minuto = 0) {
    const log = logger || console;
    function proximoDisparo() {
        const agora = new Date();
        const alvo  = new Date();
        alvo.setHours(hora, minuto, 0, 0);
        if (alvo <= agora) alvo.setDate(alvo.getDate() + 1);
        return alvo - agora;
    }
    function iniciarTimer() {
        const ms = proximoDisparo();
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        log.info({ hora, minuto, em: `${h}h${m}m` }, "redePortalScraper: agendamento configurado");
        setTimeout(async () => {
            try { await baixarRelatorioRede(log); }
            catch(err) { log.error({ err }, "redePortalScraper: falha no agendamento"); }
            iniciarTimer();
        }, ms);
    }
    iniciarTimer();
}