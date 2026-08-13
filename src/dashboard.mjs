import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web");
const STATIC_FILES = Object.freeze({
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
});

const DOWNLOADS = Object.freeze({
  "/download/snapshots.csv": ["snapshots", "snapshots.csv", "text/csv; charset=utf-8"],
  "/download/opportunities.csv": ["opportunities", "opportunities.csv", "text/csv; charset=utf-8"],
  "/download/paper_trades.csv": ["paperTrades", "paper_trades.csv", "text/csv; charset=utf-8"],
  "/download/summary.json": ["summary", "summary.json", "application/json; charset=utf-8"],
});

export class DashboardServer {
  constructor({ host, port, storage, getRuntimeState, publicConfig }) {
    this.host = host;
    this.port = port;
    this.storage = storage;
    this.getRuntimeState = getRuntimeState;
    this.publicConfig = publicConfig;
    this.server = null;
  }

  async start() {
    if (this.server) return this.getAddress();

    this.server = http.createServer((req, res) => {
      void this.handle(req, res).catch((error) => {
        console.error(`[ui] ${error?.message ?? error}`);
        if (!res.headersSent) sendJson(res, 500, { error: "Internal server error" });
        else res.end();
      });
    });

    await new Promise((resolve, reject) => {
      const onError = (error) => {
        this.server?.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this.server?.off("error", onError);
        resolve();
      };
      this.server.once("error", onError);
      this.server.once("listening", onListening);
      this.server.listen(this.port, this.host);
    });

    return this.getAddress();
  }

  async stop() {
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    await new Promise((resolve) => server.close(() => resolve()));
  }

  getAddress() {
    const address = this.server?.address();
    const port = typeof address === "object" && address ? address.port : this.port;
    const displayHost = this.host === "0.0.0.0" || this.host === "::" ? "127.0.0.1" : this.host;
    return { host: this.host, port, url: `http://${displayHost}:${port}` };
  }

  async handle(req, res) {
    setSecurityHeaders(res);

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    const pathname = requestUrl.pathname;

    if (pathname === "/healthz") {
      const runtime = this.getRuntimeState();
      return sendJson(res, 200, {
        ok: runtime.status !== "fatal",
        status: runtime.status,
        lastScanAt: runtime.lastScanAt ?? null,
      }, req.method === "HEAD");
    }

    if (pathname === "/api/state") {
      res.setHeader("Cache-Control", "no-store");
      const data = this.storage.getDashboardData(60);
      return sendJson(res, 200, {
        generatedAt: new Date().toISOString(),
        mode: "paper",
        runtime: this.getRuntimeState(),
        config: this.publicConfig,
        ...data,
      }, req.method === "HEAD");
    }

    const download = DOWNLOADS[pathname];
    if (download) {
      const [storageKey, filename, contentType] = download;
      const file = this.storage.getDownloadPath(storageKey);
      if (!file || !fs.existsSync(file)) return sendJson(res, 404, { error: "File not available yet" });
      res.statusCode = 200;
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Cache-Control", "no-store");
      if (req.method === "HEAD") return res.end();
      return fs.createReadStream(file).pipe(res);
    }

    const staticFile = STATIC_FILES[pathname];
    if (staticFile) {
      const [filename, contentType] = staticFile;
      const file = path.join(WEB_DIR, filename);
      if (!fs.existsSync(file)) return sendJson(res, 404, { error: "UI asset not found" });
      res.statusCode = 200;
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", filename === "index.html" ? "no-cache" : "public, max-age=300");
      if (req.method === "HEAD") return res.end();
      return fs.createReadStream(file).pipe(res);
    }

    return sendJson(res, 404, { error: "Not found" });
  }
}

function setSecurityHeaders(res) {
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
}

function sendJson(res, statusCode, body, headOnly = false) {
  const payload = JSON.stringify(body, jsonReplacer);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", Buffer.byteLength(payload));
  res.end(headOnly ? undefined : payload);
}

function jsonReplacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}
