// Serves the production export with deterministic SSE fixtures. Never calls an upstream API.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const root = resolve("apps/web/out");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  if (path === "/api/chat" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { question } = JSON.parse(body);
    if (question === "error") {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: "demo_busy", error: "Service busy" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (question === "nothing" || question === "private") {
      const behavior = question === "nothing" ? "abstain" : "refuse";
      send("meta", { behavior, behaviorValid: true, retrieved: [], degraded: false });
      send("token", { text: "I do not have that information. " });
      send("token", { text: "I can tell you about the projects instead." });
      send("done", { citations: [], invalidCitationsDropped: 0, truncated: false, model: "fixture" });
      res.end();
      return;
    }
    send("meta", { behavior: "answer", behaviorValid: true, retrieved: ["project-demo-006"], degraded: false });
    if (question !== "stop") send("token", { text: "A completed answer " });
    const timer = setTimeout(() => {
      send("token", { text: `${"longword".repeat(60)} [project-demo-006].` });
      send("done", { citations: ["project-demo-006"], invalidCitationsDropped: 0, truncated: false, model: "fixture" });
      res.end();
    }, question === "stop" ? 10000 : 700);
    res.on("close", () => clearTimeout(timer));
    return;
  }
  let file = resolve(root, "." + decodeURIComponent(path));
  if (!file.startsWith(root + sep) && file !== root) { res.writeHead(403).end(); return; }
  if (path.endsWith("/")) file = resolve(file, "index.html");
  else if (!extname(file)) file += ".html";
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" }).end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/html" }).end(await readFile(resolve(root, "404.html")));
  }
}).listen(4173, "127.0.0.1");
