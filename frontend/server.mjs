import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer as createHttpServer, request } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = process.cwd();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distDir = resolve(__dirname, "dist");

function loadEnv() {
  const envPath = join(rootDir, ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sep = trimmed.indexOf("=");
    if (sep < 0) continue;
    const key = trimmed.slice(0, sep).trim();
    const value = trimmed.slice(sep + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const frontendHttpPort = Number(process.env.FRONTEND_PORT || process.env.FRONTEND_HTTP_PORT || "3345");
const frontendHttpsPort = Number(process.env.FRONTEND_HTTPS_PORT || process.env.FRONTEND_TLS_PORT || "3344");
const backendTarget = process.env.BACKEND_TARGET_URL || "http://127.0.0.1:3333";
const backendUrl = new URL(backendTarget);
const tlsCertPath = process.env.TLS_CERT_PATH || process.env.FRONTEND_TLS_CERT || process.env.FRONTEND_TLS_CERT_FILE || join(rootDir, "config", "tls", "cert.pem");
const tlsKeyPath = process.env.TLS_KEY_PATH || process.env.FRONTEND_TLS_KEY || process.env.FRONTEND_TLS_KEY_FILE || join(rootDir, "config", "tls", "key.pem");
const tlsPfxPath = process.env.FRONTEND_TLS_PFX_PATH || join(rootDir, "config", "tls", "frontend.pfx");
const tlsPfxPassword = process.env.FRONTEND_TLS_PFX_PASSWORD || "";

const contentTypeByExt = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function proxyApi(req, res) {
  const options = {
    hostname: backendUrl.hostname,
    port: Number(backendUrl.port || "3333"),
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: backendUrl.host,
    },
  };

  const proxyReq = request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (error) => {
    res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Falha no proxy /api", detail: String(error) }));
  });

  req.pipe(proxyReq);
}

function serveStatic(req, res) {
  const rawPath = req.url?.split("?")[0] || "/";
  const requestPath = rawPath === "/" ? "/index.html" : rawPath;
  const normalized = normalize(requestPath).replace(/^[/\\]+/, "");
  const filePath = resolve(distDir, normalized);

  if (!filePath.startsWith(distDir)) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("Acesso negado.");
    return;
  }

  const fallback = join(distDir, "index.html");
  let finalPath = filePath;

  if (!existsSync(finalPath) || statSync(finalPath).isDirectory()) {
    finalPath = fallback;
  }

  if (!existsSync(finalPath)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Arquivo nao encontrado.");
    return;
  }

  const ext = extname(finalPath).toLowerCase();
  const contentType = contentTypeByExt[ext] || "application/octet-stream";
  const cacheControl = [".html", ".js"].includes(ext) ? "no-store" : "public, max-age=3600";
  res.writeHead(200, { "content-type": contentType, "cache-control": cacheControl });
  createReadStream(finalPath).pipe(res);
}

function requestHandler(req, res) {
  if ((req.url || "").startsWith("/api")) {
    proxyApi(req, res);
    return;
  }
  serveStatic(req, res);
}

const httpServer = createHttpServer(requestHandler);
httpServer.listen(frontendHttpPort, "0.0.0.0", () => {
  console.log(`[frontend] Torre de Controle HTTP online em http://0.0.0.0:${frontendHttpPort}`);
});

const hasPemPair = existsSync(tlsCertPath) && existsSync(tlsKeyPath);
const hasPfx = existsSync(tlsPfxPath);

if (hasPemPair || hasPfx) {
  const httpsOptions = hasPemPair
    ? { cert: readFileSync(tlsCertPath), key: readFileSync(tlsKeyPath) }
    : { pfx: readFileSync(tlsPfxPath), passphrase: tlsPfxPassword };
  const httpsServer = createHttpsServer(httpsOptions, requestHandler);
  httpsServer.listen(frontendHttpsPort, "0.0.0.0", () => {
    console.log(`[frontend] Torre de Controle HTTPS online em https://0.0.0.0:${frontendHttpsPort}`);
  });
} else {
  console.warn(`[frontend] HTTPS desativado: certificado nao encontrado. Configure ${tlsCertPath}/${tlsKeyPath} ou ${tlsPfxPath}.`);
}
