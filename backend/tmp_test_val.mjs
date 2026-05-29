import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";

const env = readFileSync("C:/TorreControle/.env","utf8");
const secret = env.match(/JWT_SECRET_KEY=(.+)/)?.[1]?.trim();
const h = Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url");
const now = Math.floor(Date.now()/1000);
const pay = Buffer.from(JSON.stringify({sub:"admin",username:"admin",role:"ADMIN",iat:now,exp:now+3600})).toString("base64url");
const sig = createHmac("sha256",secret).update(`${h}.${pay}`).digest("base64url");
const token = `${h}.${pay}.${sig}`;

const opts = { hostname:"localhost", port:3333, path:"/api/fiscal/nfse/tomadas/validar-winthor", method:"POST", headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"} };
const req = http.request(opts, res => {
    const chunks = [];
    res.on("data",c=>chunks.push(c));
    res.on("end",() => {
        const body = Buffer.concat(chunks).toString();
        console.log("Status:", res.statusCode);
        console.log("Body:", body.slice(0, 1000));
    });
});
req.on("error",e=>console.error("Error:",e.message));
req.write(JSON.stringify({competencia:"2026-05"}));
req.end();
