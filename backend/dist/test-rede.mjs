import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteerExtra.use(StealthPlugin());

const CHROME = process.env.REDE_PORTAL_CHROME;
const EMAIL  = process.env.REDE_PORTAL_EMAIL;
const SENHA  = process.env.REDE_PORTAL_SENHA;
const BASE   = "https://meu.userede.com.br";
const wait = ms => new Promise(r => setTimeout(r, ms));

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

const browser = await puppeteerExtra.launch({
    executablePath: CHROME, headless: "new",
    args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu","--window-size=1280,900"],
});

let jwtToken = null;

try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' });

    // Intercepta HEADERS das requests para a fila
    page.on("request", req => {
        if (req.url().includes("/downloads/queue")) {
            console.log("QUEUE REQUEST HEADERS:");
            const h = req.headers();
            Object.entries(h).forEach(([k,v]) => console.log(`  ${k}: ${v.substring(0,100)}`));
        }
    });
    page.on("response", async res => {
        if (res.url().includes("/api/lm1/v3/login") && res.status() === 200) {
            const b = await res.json().catch(() => null);
            if (b?.token) jwtToken = b.token;
        }
    });

    // LOGIN
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle0", timeout: 40000 });
    await wait(3000);
    await clicarTexto(page, "acessar conta");
    await wait(3000);
    await page.waitForSelector("#ids-input-0", { timeout: 10000 });
    await page.click("#ids-input-0"); await page.type("#ids-input-0", EMAIL, { delay: 80 });
    await page.click("#ids-input-1"); await page.type("#ids-input-1", SENHA, { delay: 80 });
    await wait(1000);
    await page.evaluate(() => { [...document.querySelectorAll("button")].find(b => b.textContent.trim().toLowerCase() === "acessar")?.click(); });
    await wait(8000);

    // RELATÓRIO - só para capturar os headers da fila que o app chama automaticamente
    await page.goto(`${BASE}/i/relatorio/recebimentos`, { waitUntil: "networkidle0", timeout: 40000 });
    await wait(10000); // aguarda o app chamar /downloads/queue automaticamente

} catch(e) {
    console.error("ERRO:", e.message);
} finally {
    await browser.close();
}
