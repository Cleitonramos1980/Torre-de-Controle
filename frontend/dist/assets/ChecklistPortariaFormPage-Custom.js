import { r as React, j as jsxRuntime, J as Card, N as CardContent, B as Button } from "./index-Cw1PFMX8.js";
import { I as Input } from "./input-CnWhQnjH.js";

const h  = React.createElement.bind(React);
const hs = React.createElement.bind(React);

// ── Utilitários ───────────────────────────────────────────────────────────────
function getToken() {
    try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; }
}
async function apiFetch(path, opts) {
    const res  = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts?.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || json?.error || json?.message || `Erro ${res.status}`);
    return json;
}
function todayStr()  { return new Date().toISOString().slice(0, 10); }
function nowHHMM()   { return new Date().toTimeString().slice(0, 5); }
function getIdFromUrl() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const last  = parts[parts.length - 1];
    return (last === "novo" || last === "checklist") ? null : last;
}
function isPrintMode() { return window.location.search.includes("imprimir=1"); }

// ── Constantes ────────────────────────────────────────────────────────────────
const TIPOS_ATENDIMENTO = ["Guincho Plataforma", "Guincho Garagem", "Táxi", "SOS Mecânico", "Particular"];

const ACESSORIOS = [
    ["bateria","Bateria"],["farois_aux","Faróis auxiliares"],["rodas_liga","Rodas de liga leve"],["rodas_comuns","Rodas comuns"],
    ["calotas","Calotas"],["buzina","Buzina"],["chave_veiculo","Chave do veículo"],["alarme","Alarme"],
    ["radio_tocafita","Rádio toca-fita"],["radio_cd","Rádio CD"],["radio_dvd","Rádio DVD"],["alto_falantes","Alto falantes"],
    ["bancos_diant","Bancos dianteiros"],["bancos_tras","Bancos traseiros"],["tapetes","Tapetes"],["extintor","Extintor"],
    ["macaco","Macaco"],["triangulo","Triângulo"],["chave_roda","Chave de roda"],["estepe","Estepe"],
    ["reboque","Reboque"],["documento","Documento"],["manual","Manual"],["amplificador","Amplificador"],
    ["pneu_diant","Pneu dianteiro"],["pneu_tras","Pneu traseiro"],["chav_alarme","Chaveiro de alarme"],["rebaixado","Carro rebaixado"],
    ["vist_sujo","Vistoriado sujo"],["vist_chuva","Vistoriado c/ chuva"],["vist_noite","Vistoriado à noite"],
];

const FUEL_LEVELS = ["R", "1/4", "1/2", "3/4", "C"];

const PNEUS_POSICOES = [
    { id: "de", label: "DE — Dianteiro Esq." },
    { id: "dd", label: "DD — Dianteiro Dir." },
    { id: "te", label: "TE — Traseiro Esq." },
    { id: "td", label: "TD — Traseiro Dir." },
    { id: "esp", label: "Estepe" },
];
const PNEU_ESTADOS = ["NOVO", "BOM", "RUIM"];

// ── Definição dos diagramas de veículos ───────────────────────────────────────
const VEHICLES = [
    {
        id: "car_top", label: "Carro — Vista Superior",
        viewBox: "0 0 100 200", w: 90, h: 180,
        shapes: () => [
            h("rect",    { key:"body",  x:16, y:40,  width:68, height:120, rx:12, fill:"#e5e7eb", stroke:"#374151", strokeWidth:2 }),
            h("rect",    { key:"ws_f",  x:24, y:57,  width:52, height:33,  rx:4,  fill:"#bfdbfe", stroke:"#9ca3af", strokeWidth:1.5 }),
            h("rect",    { key:"ws_r",  x:24, y:108, width:52, height:33,  rx:4,  fill:"#bfdbfe", stroke:"#9ca3af", strokeWidth:1.5 }),
            h("rect",    { key:"wfl",   x:3,  y:50,  width:11, height:24,  rx:3,  fill:"#374151" }),
            h("rect",    { key:"wfr",   x:86, y:50,  width:11, height:24,  rx:3,  fill:"#374151" }),
            h("rect",    { key:"wrl",   x:3,  y:124, width:11, height:24,  rx:3,  fill:"#374151" }),
            h("rect",    { key:"wrr",   x:86, y:124, width:11, height:24,  rx:3,  fill:"#374151" }),
            h("rect",    { key:"bf",    x:16, y:40,  width:68, height:9,   rx:4,  fill:"#9ca3af" }),
            h("rect",    { key:"br",    x:16, y:149, width:68, height:9,   rx:4,  fill:"#9ca3af" }),
        ],
        points: [
            { id:"fl",  cx:19,  cy:47,  label:"Frente Esq."     },
            { id:"fc",  cx:50,  cy:41,  label:"Frente Centro"   },
            { id:"fr",  cx:81,  cy:47,  label:"Frente Dir."     },
            { id:"sle", cx:17,  cy:76,  label:"Lateral Esq. Fr."},
            { id:"slr", cx:17,  cy:122, label:"Lateral Esq. Tr."},
            { id:"sre", cx:83,  cy:76,  label:"Lateral Dir. Fr."},
            { id:"srr", cx:83,  cy:122, label:"Lateral Dir. Tr."},
            { id:"rl",  cx:19,  cy:153, label:"Traseira Esq."   },
            { id:"rc",  cx:50,  cy:157, label:"Traseira Centro" },
            { id:"rr",  cx:81,  cy:153, label:"Traseira Dir."   },
            { id:"rf",  cx:50,  cy:82,  label:"Teto"            },
        ],
    },
    {
        id: "car_front", label: "Carro — Frente",
        viewBox: "0 0 120 90", w: 110, h: 83,
        shapes: () => [
            h("path", { key:"up",  d:"M28,10 L92,10 L108,45 L12,45 Z",          fill:"#e5e7eb", stroke:"#374151", strokeWidth:2 }),
            h("rect", { key:"lo",  x:8,  y:45, width:104, height:38, rx:5,       fill:"#e5e7eb", stroke:"#374151", strokeWidth:2 }),
            h("path", { key:"ws",  d:"M34,12 L86,12 L100,42 L20,42 Z",           fill:"#bfdbfe", stroke:"#9ca3af", strokeWidth:1.5 }),
            h("ellipse",{ key:"hl", cx:24, cy:60, rx:11, ry:8,                   fill:"#fef3c7", stroke:"#374151", strokeWidth:1.5 }),
            h("ellipse",{ key:"hr", cx:96, cy:60, rx:11, ry:8,                   fill:"#fef3c7", stroke:"#374151", strokeWidth:1.5 }),
            h("rect", { key:"gr",  x:43, y:54, width:34, height:22, rx:3,        fill:"#9ca3af", stroke:"#374151", strokeWidth:1 }),
            h("rect", { key:"lp",  x:49, y:70, width:22, height:8,  rx:2,        fill:"#f3f4f6", stroke:"#9ca3af", strokeWidth:1 }),
        ],
        points: [
            { id:"hl", cx:24,  cy:53, label:"Farol Esq."   },
            { id:"hc", cx:60,  cy:40, label:"Capo Centro"  },
            { id:"hr", cx:96,  cy:53, label:"Farol Dir."   },
            { id:"bl", cx:10,  cy:77, label:"Para-choque Esq." },
            { id:"bc", cx:60,  cy:80, label:"Para-choque Centro" },
            { id:"br", cx:110, cy:77, label:"Para-choque Dir." },
        ],
    },
    {
        id: "car_rear", label: "Carro — Traseira",
        viewBox: "0 0 120 90", w: 110, h: 83,
        shapes: () => [
            h("path", { key:"up",  d:"M28,10 L92,10 L108,45 L12,45 Z",          fill:"#e5e7eb", stroke:"#374151", strokeWidth:2 }),
            h("rect", { key:"lo",  x:8,  y:45, width:104, height:38, rx:5,       fill:"#e5e7eb", stroke:"#374151", strokeWidth:2 }),
            h("path", { key:"ws",  d:"M34,12 L86,12 L100,42 L20,42 Z",           fill:"#bfdbfe", stroke:"#9ca3af", strokeWidth:1.5 }),
            h("ellipse",{ key:"tl", cx:24, cy:60, rx:11, ry:8,                   fill:"#fee2e2", stroke:"#374151", strokeWidth:1.5 }),
            h("ellipse",{ key:"tr", cx:96, cy:60, rx:11, ry:8,                   fill:"#fee2e2", stroke:"#374151", strokeWidth:1.5 }),
            h("rect", { key:"lp",  x:46, y:55, width:28, height:10, rx:2,        fill:"#f3f4f6", stroke:"#9ca3af", strokeWidth:1 }),
        ],
        points: [
            { id:"tl", cx:24,  cy:53, label:"Lanterna Esq."  },
            { id:"tc", cx:60,  cy:42, label:"Tampa Traseira" },
            { id:"tr", cx:96,  cy:53, label:"Lanterna Dir."  },
            { id:"bl", cx:10,  cy:77, label:"Para-choque Esq." },
            { id:"bc", cx:60,  cy:80, label:"Para-choque Centro" },
            { id:"br", cx:110, cy:77, label:"Para-choque Dir." },
        ],
    },
    {
        id: "car_side", label: "Carro — Lateral",
        viewBox: "0 0 210 100", w: 200, h: 95,
        shapes: () => [
            h("path",   { key:"body", d:"M22,75 L188,75 L188,32 L152,18 L62,18 L22,32 Z",           fill:"#e5e7eb", stroke:"#374151", strokeWidth:2 }),
            h("polygon",{ key:"wsf",  points:"64,20 122,20 120,38 66,38",                            fill:"#bfdbfe", stroke:"#9ca3af", strokeWidth:1.5 }),
            h("polygon",{ key:"wsr",  points:"124,20 150,20 150,38 122,38",                          fill:"#bfdbfe", stroke:"#9ca3af", strokeWidth:1.5 }),
            h("line",   { key:"d1",   x1:92,  y1:38, x2:90,  y2:75, stroke:"#9ca3af", strokeWidth:1.5 }),
            h("line",   { key:"d2",   x1:122, y1:38, x2:122, y2:75, stroke:"#9ca3af", strokeWidth:1.5 }),
            h("circle", { key:"wf",   cx:58,  cy:77, r:15,           fill:"#374151", stroke:"#1f2937", strokeWidth:2 }),
            h("circle", { key:"wfc",  cx:58,  cy:77, r:7,            fill:"#6b7280" }),
            h("circle", { key:"wr",   cx:155, cy:77, r:15,           fill:"#374151", stroke:"#1f2937", strokeWidth:2 }),
            h("circle", { key:"wrc",  cx:155, cy:77, r:7,            fill:"#6b7280" }),
            h("ellipse",{ key:"hl",   cx:30,  cy:50, rx:9, ry:11,    fill:"#fef3c7", stroke:"#374151", strokeWidth:1.5 }),
            h("ellipse",{ key:"tl",   cx:178, cy:50, rx:9, ry:11,    fill:"#fee2e2", stroke:"#374151", strokeWidth:1.5 }),
            h("rect",   { key:"bf",   x:14,   y:62,  width:9, height:18, rx:3, fill:"#9ca3af" }),
            h("rect",   { key:"br",   x:187,  y:62,  width:9, height:18, rx:3, fill:"#9ca3af" }),
        ],
        points: [
            { id:"hl",  cx:30,  cy:44, label:"Farol Frente"     },
            { id:"hd",  cx:48,  cy:30, label:"Capô"             },
            { id:"ro",  cx:105, cy:22, label:"Teto"             },
            { id:"tr",  cx:165, cy:30, label:"Porta-malas"      },
            { id:"tl",  cx:178, cy:44, label:"Lanterna"         },
            { id:"rb",  cx:190, cy:68, label:"Para-choque Tras."},
            { id:"fb",  cx:16,  cy:68, label:"Para-choque Fr."  },
            { id:"sd",  cx:105, cy:72, label:"Lateral — Porta"  },
        ],
    },
    {
        id: "moto_side", label: "Moto — Lateral",
        viewBox: "0 0 170 110", w: 160, h: 103,
        shapes: () => [
            h("ellipse",{ key:"hl",  cx:30,  cy:58, rx:12, ry:12, fill:"#fef3c7", stroke:"#374151", strokeWidth:2 }),
            h("path",   { key:"frk", d:"M42,45 L36,78",            stroke:"#374151", strokeWidth:3, fill:"none" }),
            h("circle", { key:"wf",  cx:30,  cy:82, r:16,          fill:"#374151", stroke:"#1f2937", strokeWidth:2 }),
            h("circle", { key:"wfc", cx:30,  cy:82, r:7,           fill:"#6b7280" }),
            h("path",   { key:"frm", d:"M52,60 L80,48 L112,48 L132,62 L98,78 L62,78 Z", fill:"#e5e7eb", stroke:"#374151", strokeWidth:2 }),
            h("ellipse",{ key:"tnk", cx:80,  cy:54, rx:20, ry:10,  fill:"#d1d5db", stroke:"#374151", strokeWidth:1.5 }),
            h("ellipse",{ key:"st",  cx:100, cy:46, rx:18, ry:7,   fill:"#374151" }),
            h("path",   { key:"hb",  d:"M55,44 L65,36 L76,36",     stroke:"#374151", strokeWidth:3, fill:"none" }),
            h("circle", { key:"wr",  cx:138, cy:82, r:16,          fill:"#374151", stroke:"#1f2937", strokeWidth:2 }),
            h("circle", { key:"wrc", cx:138, cy:82, r:7,           fill:"#6b7280" }),
            h("ellipse",{ key:"tl",  cx:143, cy:58, rx:7, ry:7,    fill:"#fee2e2", stroke:"#374151", strokeWidth:1.5 }),
            h("path",   { key:"ex",  d:"M128,70 L152,74 L158,72",  stroke:"#9ca3af", strokeWidth:3, fill:"none" }),
        ],
        points: [
            { id:"fr",  cx:30,  cy:50, label:"Farol Frente"  },
            { id:"fg",  cx:55,  cy:38, label:"Farol/Guiador" },
            { id:"tnk", cx:80,  cy:46, label:"Tanque"        },
            { id:"st",  cx:100, cy:38, label:"Banco/Selim"   },
            { id:"tl",  cx:143, cy:50, label:"Lanterna"      },
            { id:"ex",  cx:148, cy:70, label:"Escapamento"   },
        ],
    },
    {
        id: "truck_side", label: "Caminhão — Lateral",
        viewBox: "0 0 250 110", w: 240, h: 103,
        shapes: () => [
            h("rect",   { key:"cab",  x:12,  y:28, width:65,  height:55, rx:5,  fill:"#d1d5db", stroke:"#374151", strokeWidth:2 }),
            h("rect",   { key:"ws",   x:20,  y:33, width:48,  height:30, rx:3,  fill:"#bfdbfe", stroke:"#9ca3af", strokeWidth:1.5 }),
            h("rect",   { key:"crg",  x:77,  y:12, width:162, height:68, rx:3,  fill:"#e5e7eb", stroke:"#374151", strokeWidth:2 }),
            h("rect",   { key:"bf",   x:8,   y:74, width:17,  height:14, rx:2,  fill:"#9ca3af" }),
            h("line",   { key:"cr1",  x1:150, y1:12, x2:150, y2:80, stroke:"#9ca3af", strokeWidth:1.5 }),
            h("rect",   { key:"hl",   x:10,  y:55, width:14,  height:10, rx:2,  fill:"#fef3c7", stroke:"#374151", strokeWidth:1 }),
            h("rect",   { key:"tl",   x:228, y:52, width:10,  height:18, rx:2,  fill:"#fee2e2", stroke:"#374151", strokeWidth:1 }),
            h("circle", { key:"wf",   cx:43,  cy:85, r:13,                       fill:"#374151", stroke:"#1f2937", strokeWidth:2 }),
            h("circle", { key:"wfc",  cx:43,  cy:85, r:6,                        fill:"#6b7280" }),
            h("circle", { key:"wr1",  cx:185, cy:85, r:13,                       fill:"#374151", stroke:"#1f2937", strokeWidth:2 }),
            h("circle", { key:"wr1c", cx:185, cy:85, r:6,                        fill:"#6b7280" }),
            h("circle", { key:"wr2",  cx:208, cy:85, r:13,                       fill:"#374151", stroke:"#1f2937", strokeWidth:2 }),
            h("circle", { key:"wr2c", cx:208, cy:85, r:6,                        fill:"#6b7280" }),
        ],
        points: [
            { id:"cb",  cx:15,  cy:55, label:"Para-choque Fr."   },
            { id:"cab", cx:45,  cy:28, label:"Teto Cabine"       },
            { id:"crf", cx:100, cy:18, label:"Baú Frente"        },
            { id:"crt", cx:158, cy:15, label:"Baú Topo"          },
            { id:"crr", cx:220, cy:18, label:"Baú Traseira"      },
            { id:"tl",  cx:232, cy:52, label:"Lanterna"          },
            { id:"rb",  cx:234, cy:80, label:"Para-choque Tras." },
            { id:"sd",  cx:158, cy:78, label:"Lateral Baú"       },
        ],
    },
];

// ── Componente: ponto de avaria no SVG ────────────────────────────────────────
function DamagePoint({ vehicleId, point, avarias, selectedDamage, onToggle }) {
    const avaria  = avarias.find(a => a.vehicleId === vehicleId && a.pointId === point.id);
    const tipo    = avaria?.tipo || null;
    const clr     = tipo === "X" ? "#fca5a5" : tipo === "-" ? "#fde68a" : tipo === "O" ? "#93c5fd" : "rgba(255,255,255,0.75)";
    const strk    = tipo ? "#374151" : "#9ca3af";
    return h("g", {
        onClick: () => onToggle(vehicleId, point.id, point.label),
        style: { cursor: "pointer" },
        children: [
            h("circle", { key:"c", cx: point.cx, cy: point.cy, r: 8, fill: clr, stroke: strk, strokeWidth: 1.5, opacity: 0.9 }),
            tipo && h("text", { key:"t", x: point.cx, y: point.cy + 4, textAnchor: "middle", fontSize: 9, fontWeight: "bold", fill: "#111827" }, tipo),
            h("title", { key:"tt" }, point.label + (tipo ? ` — ${tipo === "X" ? "Amassado" : tipo === "-" ? "Riscado" : "Quebrado"}` : " (sem avaria)")),
        ].filter(Boolean),
    });
}

// ── Componente: diagrama de veículo ───────────────────────────────────────────
function VehicleDiagram({ vehicle, avarias, selectedDamage, onToggle }) {
    return hs("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" } }, [
        h("p", { key:"lbl", style: { fontSize: "10px", fontWeight: 600, color: "#374151", textAlign: "center", margin: 0 } }, vehicle.label),
        h("svg", { key:"svg", viewBox: vehicle.viewBox, width: vehicle.w, height: vehicle.h, style: { display: "block", border: "1px solid #e5e7eb", borderRadius: "6px", background: "#f9fafb" } }, [
            ...vehicle.shapes(),
            ...vehicle.points.map(p => h(DamagePoint, { key: p.id, vehicleId: vehicle.id, point: p, avarias, selectedDamage, onToggle })),
        ]),
    ]);
}

// ── Componente: canvas de assinatura ─────────────────────────────────────────
function SignatureCanvas({ value, onChange, readOnly }) {
    const ref      = React.useRef(null);
    const drawing  = React.useRef(false);
    const last     = React.useRef(null);

    React.useEffect(() => {
        const canvas = ref.current;
        if (!canvas || !value || value.startsWith("data:")) return;
    }, []);

    React.useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (value && value.startsWith("data:")) {
            const img = new Image();
            img.onload = () => { ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0); };
            img.src = value;
        } else if (!value) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }, [value]);

    function getXY(e, canvas) {
        const rect  = canvas.getBoundingClientRect();
        const touch = e.touches?.[0] || e;
        return {
            x: (touch.clientX - rect.left) * (canvas.width  / rect.width),
            y: (touch.clientY - rect.top)  * (canvas.height / rect.height),
        };
    }

    function down(e) {
        if (readOnly) return;
        drawing.current = true;
        last.current    = getXY(e, ref.current);
    }
    function move(e) {
        if (!drawing.current || readOnly) return;
        const canvas = ref.current;
        const ctx    = canvas.getContext("2d");
        const pos    = getXY(e, canvas);
        ctx.beginPath(); ctx.strokeStyle = "#111827"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(pos.x, pos.y); ctx.stroke();
        last.current = pos;
    }
    function up() {
        if (!drawing.current) return;
        drawing.current = false;
        if (onChange && ref.current) onChange(ref.current.toDataURL());
    }
    function clear() {
        const canvas = ref.current;
        const ctx    = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (onChange) onChange("");
    }

    return hs("div", {}, [
        h("canvas", {
            key: "cv", ref,
            width: 280, height: 80,
            style: { border: "1px solid #d1d5db", borderRadius: "4px", cursor: readOnly ? "default" : "crosshair", touchAction: "none", background: "#fff", display: "block" },
            onMouseDown: down, onMouseMove: move, onMouseUp: up, onMouseLeave: up,
            onTouchStart: e => { e.preventDefault(); down(e); },
            onTouchMove:  e => { e.preventDefault(); move(e); },
            onTouchEnd:   e => { e.preventDefault(); up(); },
        }),
        !readOnly && h("button", { key:"cl", onClick: clear, style: { marginTop: "4px", padding: "2px 8px", fontSize: "11px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: "4px", cursor: "pointer" } }, "Limpar assinatura"),
    ]);
}

// ── Estilos compartilhados ────────────────────────────────────────────────────
const SEC_TITLE = { background: "#374151", color: "#fff", padding: "6px 14px", fontWeight: 700, fontSize: "12px", letterSpacing: "0.05em", margin: "16px 0 8px", borderRadius: "4px" };
const LABEL_ST  = { fontSize: "11px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "3px" };
const FIELD_GRP = { display: "flex", flexDirection: "column" };
const GRID_4    = { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "10px", alignItems: "start" };
const GRID_3    = { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px", alignItems: "start" };
const GRID_2    = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", alignItems: "start" };
const INPUT_ST  = { width: "100%", padding: "5px 8px", border: "1px solid #d1d5db", borderRadius: "5px", fontSize: "12px", boxSizing: "border-box" };
const SELECT_ST = { ...INPUT_ST, background: "#fff" };

function Field({ label, children }) {
    return hs("div", { style: FIELD_GRP }, [
        h("label", { key: "l", style: LABEL_ST }, label),
        children,
    ]);
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function ChecklistPortariaFormPage() {
    const checklistId  = getIdFromUrl();
    const printMode    = isPrintMode();
    const isNew        = !checklistId;

    const emptyForm = () => ({
        tipoMovimento: "",
        placa: "", km: "", tipoAtendimento: "",
        dataSolicitacao: todayStr(), horaSolicitacao: nowHHMM(),
        motorista: "", sinistro: "", proprietario: "", seguradora: "", telefone: "",
        veiculo: "", ano: "", cor: "",
        localAtendimento: { endereco: "", numero: "", bairro: "", cidade: "", telefone: "", estado: "" },
        localDestino:     { endereco: "", numero: "", bairro: "", cidade: "", oficina: "", telefone: "", estado: "" },
        fotografado: null,
        nivelCombustivel: "",
        pneus: {},
        acessorios: {},
        termos: { dispensaVistoria: false, acompanhouRemocao: null, orientadoPertences: null, clienteCiente: "" },
        assinaturas: {
            seguradoNome: "", seguradoData: todayStr(), seguradoHora: nowHHMM(), seguradoAssinatura: "",
            destinatarioNome: "", destinatarioData: todayStr(), destinatarioHora: nowHHMM(), destinatarioAssinatura: "",
            prestadorNome: "", prestadorAssinatura: "",
        },
    });

    const [form,        setForm]        = React.useState(emptyForm());
    const [avarias,     setAvarias]     = React.useState([]);
    const [selDmg,      setSelDmg]      = React.useState("X");
    const [numChecklist,setNumChecklist]= React.useState("—");
    const [status,      setStatus]      = React.useState("RASCUNHO");
    const [loading,     setLoading]     = React.useState(!isNew);
    const [saving,      setSaving]      = React.useState(false);
    const [erro,        setErro]        = React.useState(null);
    const [ok,          setOk]          = React.useState(null);
    // Carregamento (saída)
    const [numCar,      setNumCar]      = React.useState("");
    const [buscandoCar, setBuscandoCar] = React.useState(false);
    const [carregamento,setCarregamento]= React.useState(null);
    const [erroCar,     setErroCar]     = React.useState(null);

    const pesquisarCarregamento = async () => {
        if (!numCar) return;
        setBuscandoCar(true); setErroCar(null); setCarregamento(null);
        try {
            const r = await apiFetch(`/api/portaria/carregamento/${numCar}`);
            setCarregamento(r);
            if (r.motorista) setForm(f => ({ ...f, assinaturas: { ...f.assinaturas, prestadorNome: r.motorista } }));
        } catch(e) { setErroCar(e.message); }
        finally { setBuscandoCar(false); }
    };

    React.useEffect(() => {
        if (isNew) return;
        setLoading(true);
        apiFetch(`/api/portaria/checklists/${checklistId}`)
            .then(data => {
                setNumChecklist(data.numeroChecklist || "—");
                setStatus(data.status || "RASCUNHO");
                setAvarias(data.avarias || []);
                setForm(f => ({
                    ...emptyForm(),
                    placa:            data.placa            || "",
                    km:               data.km               || "",
                    tipoAtendimento:  data.tipoAtendimento  || "",
                    dataSolicitacao:  data.dataSolicitacao  || todayStr(),
                    horaSolicitacao:  data.horaSolicitacao  || nowHHMM(),
                    motorista:        data.motorista        || "",
                    sinistro:         data.sinistro         || "",
                    proprietario:     data.proprietario     || "",
                    seguradora:       data.seguradora       || "",
                    telefone:         data.telefone         || "",
                    veiculo:          data.veiculo          || "",
                    ano:              data.ano              || "",
                    cor:              data.cor              || "",
                    localAtendimento: data.localAtendimento || { endereco:"",numero:"",bairro:"",cidade:"",telefone:"",estado:"" },
                    localDestino:     data.localDestino     || { endereco:"",numero:"",bairro:"",cidade:"",oficina:"",telefone:"",estado:"" },
                    fotografado:      data.fotografado      ?? null,
                    nivelCombustivel: data.nivelCombustivel || "",
                    pneus:            data.pneus            || {},
                    acessorios:       data.acessorios       || {},
                    termos:           data.termos           || { dispensaVistoria:false,acompanhouRemocao:null,orientadoPertences:null,clienteCiente:"" },
                    assinaturas:      data.assinaturas      || emptyForm().assinaturas,
                }));
            })
            .catch(e => setErro(e.message))
            .finally(() => setLoading(false));
    }, [checklistId]);

    function setF(path, value) {
        setForm(prev => {
            if (!path.includes(".")) return { ...prev, [path]: value };
            const [section, field] = path.split(".");
            return { ...prev, [section]: { ...prev[section], [field]: value } };
        });
    }

    function toggleDamage(vehicleId, pointId, pointLabel) {
        setAvarias(prev => {
            const idx = prev.findIndex(a => a.vehicleId === vehicleId && a.pointId === pointId);
            if (idx >= 0 && prev[idx].tipo === selDmg) return prev.filter((_,i)=>i!==idx);
            if (idx >= 0) { const u=[...prev]; u[idx]={...u[idx],tipo:selDmg}; return u; }
            return [...prev, { vehicleId, pointId, pointLabel, tipo: selDmg }];
        });
    }

    function setAcessorio(id, val) { setForm(prev => ({ ...prev, acessorios: { ...prev.acessorios, [id]: val } })); }
    function setPneu(id,  val) { setForm(prev => ({ ...prev, pneus: { ...prev.pneus, [id]: val } })); }
    function setTermo(k,  val) { setForm(prev => ({ ...prev, termos: { ...prev.termos, [k]: val } })); }
    function setAssinatura(k, val) { setForm(prev => ({ ...prev, assinaturas: { ...prev.assinaturas, [k]: val } })); }

    async function salvar(novoStatus) {
        setSaving(true); setErro(null); setOk(null);
        const payload = { ...form, avarias, status: novoStatus || status };
        try {
            if (isNew) {
                const res = await apiFetch("/api/portaria/checklists", { method: "POST", body: JSON.stringify(payload) });
                window.location.href = `/portaria/checklist/${res.id}`;
            } else {
                const res = await apiFetch(`/api/portaria/checklists/${checklistId}`, { method: "PUT", body: JSON.stringify(payload) });
                setNumChecklist(res.numeroChecklist || numChecklist);
                setStatus(res.status || status);
                setOk("Checklist salvo com sucesso!");
                setTimeout(() => setOk(null), 4000);
            }
        } catch(e) { setErro(e.message); }
        finally { setSaving(false); }
    }

    const readOnly = status === "FINALIZADO" || status === "CANCELADO";

    // ── MODO IMPRESSÃO ──────────────────────────────────────────────────────
    if (printMode) {
        return h(PrintView, { form, avarias, numChecklist, status });
    }

    if (loading) return h("div", { style: { padding: "40px", textAlign: "center", color: "#6b7280" } }, "Carregando checklist...");

    // ── FORMULÁRIO COMPLETO ─────────────────────────────────────────────────
    const inp = (path, props={}) => h("input", { style: INPUT_ST, disabled: readOnly, value: (path.includes(".") ? form[path.split(".")[0]][path.split(".")[1]] : form[path]) || "", onChange: e => setF(path, e.target.value), ...props });
    const sel = (path, children, props={}) => h("select", { style: SELECT_ST, disabled: readOnly, value: (path.includes(".") ? form[path.split(".")[0]][path.split(".")[1]] : form[path]) || "", onChange: e => setF(path, e.target.value), ...props, children });

    return hs("div", { style: { padding: "20px", maxWidth: "960px", margin: "0 auto", fontFamily: "system-ui,sans-serif" } }, [

        // ── Topo ──
        hs("div", { key:"topo", style: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"16px" } }, [
            hs("div", { key:"t" }, [
                h("h1", { key:"h1", style: { fontSize:"20px", fontWeight:700, margin:0 } }, isNew ? "Novo Checklist de Vistoria" : `Checklist ${numChecklist}`),
                h("p",  { key:"p",  style: { fontSize:"12px", color:"#6b7280", margin:"4px 0 0" } }, "Acessos / Portaria — Vistoria de Veículo"),
            ]),
            hs("div", { key:"btns", style: { display:"flex", gap:"8px", flexWrap:"wrap" } }, [
                h("button", { key:"vol", onClick: () => { window.location.href="/portaria/checklist"; }, style: { padding:"6px 14px", fontSize:"12px", background:"#f3f4f6", border:"1px solid #d1d5db", borderRadius:"5px", cursor:"pointer" } }, "← Voltar"),
                !readOnly && h(Button, { key:"sv", onClick: () => salvar(), disabled: saving, style: { background:"#2563eb", color:"#fff" } }, saving ? "Salvando..." : "Salvar Rascunho"),
                !readOnly && status === "RASCUNHO" && h(Button, { key:"fin", onClick: () => { if (window.confirm("Finalizar este checklist? Não poderá mais ser editado.")) salvar("FINALIZADO"); }, style: { background:"#059669", color:"#fff" } }, "Finalizar"),
                h("button", { key:"prt", onClick: () => { window.open(window.location.href + (window.location.search ? "&imprimir=1" : "?imprimir=1"), "_blank"); }, style: { padding:"6px 14px", fontSize:"12px", background:"#7c3aed", color:"#fff", border:"none", borderRadius:"5px", cursor:"pointer" } }, "Imprimir"),
            ].filter(Boolean)),
        ]),

        // ── Alertas ──
        erro && h("div", { key:"err", style: { padding:"10px 14px", background:"#fee2e2", color:"#991b1b", borderRadius:"6px", marginBottom:"12px", fontSize:"12px" } }, "Erro: " + erro),
        ok   && h("div", { key:"ok",  style: { padding:"10px 14px", background:"#dcfce7", color:"#166534", borderRadius:"6px", marginBottom:"12px", fontSize:"12px" } }, ok),
        readOnly && h("div", { key:"ro", style: { padding:"10px 14px", background:"#fef3c7", color:"#92400e", borderRadius:"6px", marginBottom:"12px", fontSize:"12px", fontWeight:600 } }, `Checklist ${status === "FINALIZADO" ? "FINALIZADO" : "CANCELADO"} — somente leitura.`),

        // ── Card principal ──
        h(Card, { key:"main", children: h(CardContent, { style: { padding:"20px" } }, hs("div", {}, [

            // ── DADOS DA SUA EMPRESA ──
            hs("div", { key:"title", style: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0 14px", borderBottom:"2px solid #374151", marginBottom:"12px" } }, [
                h("div", { key:"spacer", style: { width:"200px" } }),
                h("h2", { key:"h2", style: { fontSize:"22px", fontWeight:800, color:"#111827", letterSpacing:"0.04em", textAlign:"center", flex:1 } }, "DADOS DA EMPRESA"),
                hs("div", { key:"flags", style: { display:"flex", gap:"8px", width:"200px", justifyContent:"flex-end" } }, [
                    h("button", { key:"ent", onClick: () => !readOnly && setF("tipoMovimento", form.tipoMovimento === "ENTRADA" ? "" : "ENTRADA"),
                        style: { padding:"6px 18px", fontWeight:800, fontSize:"13px", border:"2px solid " + (form.tipoMovimento==="ENTRADA" ? "#16a34a" : "#d1d5db"), borderRadius:"6px", cursor: readOnly ? "default" : "pointer", background: form.tipoMovimento==="ENTRADA" ? "#16a34a" : "#f9fafb", color: form.tipoMovimento==="ENTRADA" ? "#fff" : "#374151" } }, "ENTRADA"),
                    h("button", { key:"sai", onClick: () => !readOnly && setF("tipoMovimento", form.tipoMovimento === "SAÍDA" ? "" : "SAÍDA"),
                        style: { padding:"6px 18px", fontWeight:800, fontSize:"13px", border:"2px solid " + (form.tipoMovimento==="SAÍDA" ? "#dc2626" : "#d1d5db"), borderRadius:"6px", cursor: readOnly ? "default" : "pointer", background: form.tipoMovimento==="SAÍDA" ? "#dc2626" : "#f9fafb", color: form.tipoMovimento==="SAÍDA" ? "#fff" : "#374151" } }, "SAÍDA"),
                ]),
            ]),

            // ── Painel Carregamento (só para SAÍDA) ──
            form.tipoMovimento === "SAÍDA" && h("div", { key:"car-panel", style: { margin:"12px 0", background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:"10px", padding:"14px 18px" } },
                h("div", { style:{ fontWeight:700, fontSize:"13px", color:"#0c4a6e", marginBottom:"10px" } }, "Conferência de Carregamento"),
                h("div", { style:{ display:"flex", gap:"10px", alignItems:"flex-end", flexWrap:"wrap", marginBottom:"10px" } },
                    h("div", null,
                        h("label", { style:{ fontSize:"11px", fontWeight:600, color:"#374151", display:"block", marginBottom:"3px" } }, "Nº do Carregamento"),
                        h("input", { type:"number", value:numCar, onChange: e => setNumCar(e.target.value),
                            onKeyDown: e => e.key === "Enter" && pesquisarCarregamento(),
                            placeholder:"Ex: 12345",
                            style:{ width:"160px", padding:"8px 12px", borderRadius:"8px", border:"1px solid #93c5fd", fontSize:"14px", fontWeight:600, outline:"none" }
                        })
                    ),
                    h("button", { onClick: pesquisarCarregamento, disabled: buscandoCar || !numCar,
                        style:{ padding:"8px 20px", borderRadius:"8px", border:"none", background: buscandoCar || !numCar ? "#93c5fd" : "#1d4ed8", color:"white", fontWeight:700, fontSize:"13px", cursor: buscandoCar || !numCar ? "default" : "pointer" }
                    }, buscandoCar ? "Pesquisando..." : "Pesquisar"),
                    carregamento && h("button", { onClick: () => { setCarregamento(null); setNumCar(""); setErroCar(null); },
                        style:{ padding:"8px 14px", borderRadius:"8px", border:"1px solid #d1d5db", background:"white", fontSize:"12px", cursor:"pointer", color:"#6b7280" }
                    }, "Limpar")
                ),
                erroCar && h("div", { style:{ background:"#fee2e2", border:"1px solid #fecaca", borderRadius:"8px", padding:"10px 14px", color:"#991b1b", fontSize:"13px", marginBottom:"8px" } }, erroCar),

                carregamento && h("div", null,
                    // Resumo do carregamento
                    h("div", { style:{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px,1fr))", gap:"8px", marginBottom:"14px" } },
                        [
                            ["Carregamento Nº", carregamento.numcar],
                            ["Destino",         carregamento.destino    || "—"],
                            ["Veículo",         carregamento.veiculo    || "—"],
                            ["Placa",           carregamento.placa      || "—"],
                            ["Motorista",       carregamento.motorista  || "—"],
                            ["Total de Itens",  carregamento.totItens   ?? carregamento.itens?.length ?? "—"],
                        ].map(([k,v]) => h("div", { key:k, style:{ background:"white", borderRadius:"8px", padding:"8px 12px", border:"1px solid #e0f2fe" } },
                            h("div", { style:{ fontSize:"10px", color:"#6b7280", marginBottom:"2px" } }, k),
                            h("div", { style:{ fontWeight:700, fontSize:"14px", color:"#0c4a6e" } }, v)
                        ))
                    ),

                    // Tabela de itens
                    h("div", { style:{ overflowX:"auto", borderRadius:"8px", border:"1px solid #bae6fd" } },
                        h("table", { style:{ width:"100%", borderCollapse:"collapse", fontSize:"12px" } },
                            h("thead", null,
                                h("tr", { style:{ background:"#1d4ed8", color:"white" } },
                                    ["Cód.", "Descrição", "Embalagem", "Depto", "EAN", "Qtde"].map((col, i) =>
                                        h("th", { key:i, style:{ padding:"8px 10px", textAlign: i >= 5 ? "right" : "left", fontWeight:600, whiteSpace:"nowrap" } }, col)
                                    )
                                )
                            ),
                            h("tbody", null,
                                (carregamento.itens || []).map((item, i) =>
                                    h("tr", { key:item.codprod, style:{ background: i%2===0 ? "white" : "#f0f9ff", borderBottom:"1px solid #e0f2fe" } },
                                        h("td", { style:{ padding:"6px 10px", fontFamily:"monospace", fontWeight:600 } }, item.codprod),
                                        h("td", { style:{ padding:"6px 10px", fontWeight:500 } }, item.descricao),
                                        h("td", { style:{ padding:"6px 10px", color:"#6b7280" } }, item.embalagem || "—"),
                                        h("td", { style:{ padding:"6px 10px", color:"#6b7280", fontSize:"11px" } }, item.departamento || item.codepto || "—"),
                                        h("td", { style:{ padding:"6px 10px", fontFamily:"monospace", fontSize:"11px" } }, item.codAuxiliar || "—"),
                                        h("td", { style:{ padding:"6px 10px", textAlign:"right", fontWeight:700, fontSize:"13px" } }, Number(item.qt).toLocaleString("pt-BR",{maximumFractionDigits:2}))
                                    )
                                )
                            )
                        )
                    ),
                    h("div", { style:{ textAlign:"right", fontSize:"11px", color:"#6b7280", marginTop:"6px" } },
                        `${carregamento.itens?.length ?? 0} produto(s) listado(s)`)
                )
            ),

            // ── Linha 1: Placa, KM, Data, Hora ──
            hs("div", { key:"l1", style: { display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:"10px", alignItems:"end", marginBottom:"10px" } }, [
                h(Field, { key:"placa", label:"Placa *"           }, inp("placa", { placeholder:"ABC-1234" })),
                h(Field, { key:"km",    label:"KM *"              }, inp("km",    { placeholder:"0" })),
                h(Field, { key:"data",  label:"Data *"            }, inp("dataSolicitacao", { type:"date" })),
                h(Field, { key:"hora",  label:"Hora Solicitação *"}, inp("horaSolicitacao", { type:"time" })),
            ]),

            // ── Linha 2 ──
            hs("div", { key:"l2", style: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px", marginBottom:"10px" } }, [
                h(Field, { key:"motor", label:"Motorista" }, inp("motorista")),
                hs("div", { key:"num", style: { display:"flex", flexDirection:"column", justifyContent:"flex-end" } }, [
                    h("label", { key:"l", style: LABEL_ST }, "Checklist Nº"),
                    h("div", { key:"v", style: { padding:"5px 8px", border:"1px solid #d1d5db", borderRadius:"5px", fontSize:"14px", fontWeight:800, color:"#2563eb", background:"#f9fafb" } }, numChecklist),
                ]),
            ]),

            // ── Linha 3 ──
            h(Field, { key:"tel", label:"Telefone" }, inp("telefone")),

            // ── Linha 4 ──
            hs("div", { key:"l5", style: { display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr", gap:"10px", marginTop:"8px" } }, [
                h(Field, { key:"ve",  label:"Veículo" }, inp("veiculo")),
                h(Field, { key:"an",  label:"Ano"     }, inp("ano",  { placeholder:"2024" })),
                h(Field, { key:"co",  label:"Cor"     }, inp("cor")),
                h(Field, { key:"pl2", label:"Placa"   }, inp("placa")),
                h(Field, { key:"km2", label:"KM"      }, inp("km")),
            ]),

            // ── LOCAL DE DESTINO ──
            h("div", { key:"sdt", style: SEC_TITLE }, "LOCAL DE DESTINO"),
            hs("div", { key:"dt1", style: { display:"grid", gridTemplateColumns:"3fr 1fr 1fr", gap:"10px", marginBottom:"8px" } }, [
                h(Field, { key:"end", label:"Endereço" }, inp("localDestino.endereco")),
                h(Field, { key:"num", label:"Nº"       }, inp("localDestino.numero")),
                h(Field, { key:"bai", label:"Bairro"   }, inp("localDestino.bairro")),
            ]),
            hs("div", { key:"dt2", style: { display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr", gap:"10px", marginBottom:"8px" } }, [
                h(Field, { key:"cid", label:"Cidade"   }, inp("localDestino.cidade")),
                h(Field, { key:"ofi", label:"Oficina"  }, inp("localDestino.oficina")),
                h(Field, { key:"tel", label:"Telefone" }, inp("localDestino.telefone")),
                h(Field, { key:"uf",  label:"Estado"   }, inp("localDestino.estado", { placeholder:"UF", maxLength:2 })),
            ]),

            // ── ÁREA DE VISTORIA ──
            h("div", { key:"svis", style: SEC_TITLE }, "ÁREA DE VISTORIA — MARCAÇÃO DE AVARIAS"),

            // Seletor de tipo de dano
            !readOnly && hs("div", { key:"dmgsel", style: { display:"flex", gap:"8px", alignItems:"center", marginBottom:"12px" } }, [
                h("span", { key:"lbl", style: { fontSize:"11px", fontWeight:700, color:"#374151" } }, "Tipo de avaria:"),
                ...["X","- ",  "O"].map((tipo, i) => {
                    const t = tipo.trim();
                    const labels = { X:"X — Amassado", "-":"— Riscado", O:"O — Quebrado" };
                    const colors = { X:"#fee2e2", "-":"#fef3c7", O:"#dbeafe" };
                    const bdr    = { X:"#fca5a5", "-":"#fde68a", O:"#93c5fd" };
                    return h("button", {
                        key: t,
                        onClick: () => setSelDmg(t),
                        style: { padding:"4px 10px", fontSize:"11px", fontWeight:700, borderRadius:"5px", cursor:"pointer", border: selDmg===t ? `2px solid #374151` : `1px solid ${bdr[t]}`, background: selDmg===t ? "#374151" : colors[t], color: selDmg===t ? "#fff" : "#111827" },
                    }, labels[t]);
                }),
                h("span", { key:"hint", style: { fontSize:"10px", color:"#9ca3af", marginLeft:"6px" } }, "Clique em um ponto do diagrama para marcar"),
            ]),

            // Legendas
            hs("div", { key:"leg", style: { display:"flex", gap:"16px", marginBottom:"12px", flexWrap:"wrap" } }, [
                hs("span", { key:"x", style: { fontSize:"11px" } }, [h("strong",{},"X"), " — Amassado"]),
                hs("span", { key:"-", style: { fontSize:"11px" } }, [h("strong",{},"—"), " — Riscado"]),
                hs("span", { key:"o", style: { fontSize:"11px" } }, [h("strong",{},"O"), " — Quebrado"]),
            ]),

            // Diagramas de veículos
            hs("div", { key:"diagrams", style: { display:"flex", flexWrap:"wrap", gap:"16px", justifyContent:"flex-start", marginBottom:"16px" } },
                VEHICLES.map(v => h(VehicleDiagram, { key:v.id, vehicle:v, avarias, selectedDamage:selDmg, onToggle:readOnly ? ()=>{} : toggleDamage }))
            ),

            // ── Fotografado, Combustível, Pneus ──
            hs("div", { key:"extras", style: { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"16px", marginBottom:"16px", alignItems:"start" } }, [

                // Fotografado
                hs("div", { key:"foto" }, [
                    h("div", { key:"t", style: { ...SEC_TITLE, margin:"0 0 8px" } }, "FOTOGRAFADO"),
                    hs("div", { style: { display:"flex", gap:"12px" } },
                        [true, false].map(v => hs("label", { key:String(v), style: { display:"flex", alignItems:"center", gap:"5px", fontSize:"12px", cursor:"pointer" } }, [
                            h("input", { key:"r", type:"radio", checked: form.fotografado === v, onChange: () => setF("fotografado", v), disabled: readOnly }),
                            v ? "Sim" : "Não",
                        ]))
                    ),
                ]),

                // Combustível
                hs("div", { key:"fuel" }, [
                    h("div", { key:"t", style: { ...SEC_TITLE, margin:"0 0 8px" } }, "COMBUSTÍVEL"),
                    hs("div", { style: { display:"flex", gap:"4px", alignItems:"center" } },
                        FUEL_LEVELS.map(lv => h("button", {
                            key: lv,
                            onClick: () => !readOnly && setF("nivelCombustivel", form.nivelCombustivel === lv ? "" : lv),
                            style: { padding:"4px 8px", fontSize:"11px", fontWeight:700, border:"1px solid #d1d5db", borderRadius:"4px", cursor:readOnly?"default":"pointer", background: form.nivelCombustivel===lv ? "#f59e0b" : "#f9fafb", color: form.nivelCombustivel===lv ? "#fff" : "#374151" },
                        }, lv))
                    ),
                ]),

                // Pneus
                hs("div", { key:"pneus" }, [
                    h("div", { key:"t", style: { ...SEC_TITLE, margin:"0 0 8px" } }, "PNEUS"),
                    hs("div", { style: { fontSize:"10px" } },
                        PNEUS_POSICOES.map(p => hs("div", { key:p.id, style: { display:"flex", alignItems:"center", gap:"6px", marginBottom:"3px" } }, [
                            h("span", { key:"l", style: { minWidth:"120px", fontSize:"10px", color:"#374151" } }, p.label),
                            ...PNEU_ESTADOS.map(e => h("button", {
                                key:e,
                                onClick: () => !readOnly && setPneu(p.id, form.pneus[p.id]===e ? "" : e),
                                style: { padding:"1px 5px", fontSize:"9px", fontWeight:700, border:"1px solid #d1d5db", borderRadius:"3px", cursor:readOnly?"default":"pointer", background: form.pneus[p.id]===e ? "#374151" : "#f9fafb", color: form.pneus[p.id]===e ? "#fff" : "#6b7280" },
                            }, e[0]))
                        ]))
                    ),
                ]),
            ]),

            // ── ACESSÓRIOS E EQUIPAMENTOS ──
            h("div", { key:"sacc", style: SEC_TITLE }, "ACESSÓRIOS E EQUIPAMENTOS (S = Existente | N = Não existente | A = Avariado)"),
            hs("div", { key:"accgrid", style: { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"0", border:"1px solid #e5e7eb", borderRadius:"4px", overflow:"hidden", marginBottom:"16px" } },
                ACESSORIOS.map(([id, label]) => {
                    const val = form.acessorios[id] || null;
                    return hs("div", { key:id, style: { display:"flex", alignItems:"center", gap:"4px", padding:"4px 6px", borderBottom:"1px solid #f3f4f6", borderRight:"1px solid #f3f4f6" } }, [
                        h("span", { key:"l", style: { fontSize:"9px", flex:1, color:"#374151", minWidth:0 } }, label),
                        ...["S","N","A"].map(opt => {
                            const colors = { S:"#dcfce7", N:"#f3f4f6", A:"#fee2e2" };
                            const tcolor = { S:"#166534", N:"#374151", A:"#991b1b" };
                            const active = val === opt;
                            return h("button", {
                                key:opt,
                                onClick: () => !readOnly && setAcessorio(id, active ? null : opt),
                                style: { padding:"1px 5px", fontSize:"9px", fontWeight:800, border: active ? "1px solid #374151" : "1px solid #e5e7eb", borderRadius:"3px", cursor:readOnly?"default":"pointer", background: active ? colors[opt] : "transparent", color: active ? tcolor[opt] : "#9ca3af", minWidth:"18px" },
                            }, opt);
                        }),
                    ]);
                })
            ),

            // ── RESPONSÁVEL ──
            h("div", { key:"spre", style: SEC_TITLE }, "RESPONSÁVEL"),
            hs("div", { key:"sig3", style: { border:"1px solid #e5e7eb", borderRadius:"6px", padding:"16px", marginBottom:"12px" } }, [
                hs("div", { key:"top", style: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:"16px", alignItems:"start" } }, [
                    // Coluna esquerda: nome + assinatura
                    hs("div", { key:"left" }, [
                        h(Field, { key:"n", label:"Nome do Responsável" },
                            h("input", { style: INPUT_ST, value: form.assinaturas.prestadorNome||"", onChange: e => setAssinatura("prestadorNome", e.target.value), disabled: readOnly })
                        ),
                        h("div", { key:"sp", style: { marginTop:"10px" } },
                            h(Field, { key:"sig", label:"Assinatura" },
                                h(SignatureCanvas, { value: form.assinaturas.prestadorAssinatura, onChange: v => setAssinatura("prestadorAssinatura", v), readOnly })
                            )
                        ),
                    ]),
                    // Coluna direita: declaração
                    h("div", { key:"right", style: { padding:"12px", background:"#fef3c7", borderRadius:"6px", border:"1px solid #fde68a", fontSize:"12px", color:"#78350f", lineHeight:"1.6", alignSelf:"center" } },
                        "Declaro estar ciente que o veículo foi devidamente vistoriado e todos os objetos pertencentes relacionados, estando de acordo com todas as informações contidas neste formulário."
                    ),
                ]),
            ]),

            // ── Botões rodapé ──
            !readOnly && hs("div", { key:"btmbtns", style: { display:"flex", gap:"10px", justifyContent:"flex-end", paddingTop:"16px", borderTop:"1px solid #e5e7eb", marginTop:"8px" } }, [
                h("button", { key:"vol", onClick: () => { window.location.href="/portaria/checklist"; }, style: { padding:"8px 18px", fontSize:"13px", background:"#f3f4f6", border:"1px solid #d1d5db", borderRadius:"6px", cursor:"pointer" } }, "Voltar"),
                h(Button, { key:"sv", onClick: () => salvar(), disabled: saving, style: { background:"#2563eb", color:"#fff" } }, saving ? "Salvando..." : "Salvar Rascunho"),
                status === "RASCUNHO" && h(Button, { key:"fin", onClick: () => { if(window.confirm("Finalizar checklist? Não poderá mais ser editado.")) salvar("FINALIZADO"); }, style: { background:"#059669", color:"#fff" } }, "Finalizar Checklist"),
            ].filter(Boolean)),

        ])) }),

    ]);
}

// ── Vista de impressão ────────────────────────────────────────────────────────
function PrintView({ form, avarias, numChecklist, status }) {
    const fmtDate = v => { if(!v) return "___/___/______"; const [y,m,d]=String(v).slice(0,10).split("-"); return `${d}/${m}/${y}`; };
    const la = form.localAtendimento || {};
    const ld = form.localDestino || {};
    const tr = form.termos || {};
    const si = form.assinaturas || {};

    React.useEffect(() => { setTimeout(() => window.print(), 500); }, []);

    const sty = {
        page:   { fontFamily:"Arial,sans-serif", fontSize:"10px", color:"#000", padding:"10px 14px", maxWidth:"750px", margin:"0 auto", lineHeight:1.3 },
        picote: { borderTop:"2px dashed #aaa", textAlign:"center", fontSize:"9px", letterSpacing:"0.2em", paddingBottom:"6px", marginBottom:"10px", color:"#555" },
        bigTitle:{ fontSize:"22px", fontWeight:900, textAlign:"center", padding:"8px 0", borderBottom:"2px solid #000", marginBottom:"8px" },
        secBar: { background:"#374151", color:"#fff", padding:"3px 8px", fontWeight:700, fontSize:"9px", letterSpacing:"0.05em", margin:"8px 0 4px" },
        row:    { display:"flex", gap:"6px", marginBottom:"4px" },
        field:  { border:"1px solid #aaa", padding:"2px 5px", flex:1, minHeight:"16px", fontSize:"9px" },
        lbl:    { fontSize:"8px", color:"#555", display:"block", marginBottom:"1px" },
        bold:   { fontWeight:700 },
        snaGrid:{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"0", border:"1px solid #aaa", marginBottom:"6px" },
        snaItem:{ display:"flex", alignItems:"center", gap:"3px", padding:"2px 4px", borderBottom:"1px solid #eee", borderRight:"1px solid #eee", fontSize:"8px" },
    };

    function fval(path) {
        if (!path.includes(".")) return form[path] || "";
        const [s,f] = path.split(".");
        return (form[s] || {})[f] || "";
    }

    function PF({ label, value, flex }) {
        return hs("div", { style: { ...sty.field, flex: flex||1 } }, [
            h("div", { key:"l", style: sty.lbl }, label),
            h("div", { key:"v", style: sty.bold }, value || " "),
        ]);
    }

    function AvariasList() {
        if (!avarias || avarias.length === 0) return h("div", { style: { fontSize:"9px", color:"#888" } }, "Nenhuma avaria registrada.");
        const typeLabel = { X:"Amassado", "-":"Riscado", O:"Quebrado" };
        return hs("div", { style: { display:"flex", flexWrap:"wrap", gap:"4px" } },
            avarias.map((a,i) => h("span", { key:i, style: { border:"1px solid #aaa", padding:"1px 5px", borderRadius:"3px", fontSize:"8px" } }, `${a.tipo}(${typeLabel[a.tipo]||""}) — ${a.pointLabel||a.pointId} [${a.vehicleId}]`))
        );
    }

    return hs("div", { style: sty.page }, [
        h("div", { key:"picote", style: sty.picote }, "✂ PICOTE"),
        h("div", { key:"title",  style: sty.bigTitle }, "DADOS DA EMPRESA — CHECKLIST DE VISTORIA"),
        h("div", { key:"num",    style: { textAlign:"right", fontWeight:900, fontSize:"13px", marginBottom:"6px" } }, `CHECK LIST Nº ${numChecklist}`),

        form.tipoMovimento && h("div", { key:"tmov", style: { display:"inline-block", padding:"4px 18px", fontWeight:900, fontSize:"14px", borderRadius:"6px", marginBottom:"8px", background: form.tipoMovimento==="ENTRADA" ? "#16a34a" : "#dc2626", color:"#fff" } }, form.tipoMovimento),

        hs("div", { key:"l1", style: sty.row }, [
            h(PF, { key:"pl", label:"Placa",    value:form.placa }),
            h(PF, { key:"km", label:"KM",       value:form.km }),
            h(PF, { key:"dt", label:"Data",     value:fmtDate(form.dataSolicitacao) }),
            h(PF, { key:"hr", label:"Hora Sol.",value:form.horaSolicitacao }),
        ]),
        hs("div", { key:"l2", style: sty.row }, [
            h(PF, { key:"mo", label:"Motorista", value:form.motorista, flex:2 }),
            h(PF, { key:"te", label:"Tel.",      value:form.telefone }),
        ]),
        hs("div", { key:"l5", style: sty.row }, [
            h(PF, { key:"ve", label:"Veículo", value:form.veiculo, flex:2 }),
            h(PF, { key:"an", label:"Ano",     value:form.ano }),
            h(PF, { key:"co", label:"Cor",     value:form.cor }),
        ]),

        h("div", { key:"sdtb", style: sty.secBar }, "LOCAL DE DESTINO"),
        hs("div", { key:"dt1", style: sty.row }, [h(PF, { key:"e", label:"Endereço", value:ld.endereco, flex:3 }), h(PF, { key:"n", label:"Nº",     value:ld.numero }),   h(PF, { key:"b", label:"Bairro",  value:ld.bairro,  flex:2 })]),
        hs("div", { key:"dt2", style: sty.row }, [h(PF, { key:"c", label:"Cidade",   value:ld.cidade,   flex:2 }), h(PF, { key:"o", label:"Oficina", value:ld.oficina }),  h(PF, { key:"t", label:"Tel.",    value:ld.telefone }), h(PF, { key:"u", label:"UF", value:ld.estado })]),

        h("div", { key:"savarb", style: sty.secBar }, "MARCAÇÕES DE AVARIA"),
        h(AvariasList, { key:"avlist" }),

        hs("div", { key:"extras", style: { display:"flex", gap:"12px", marginTop:"6px", marginBottom:"6px" } }, [
            h(PF, { key:"fo", label:"Fotografado",   value:form.fotografado===true?"Sim":form.fotografado===false?"Não":"" }),
            h(PF, { key:"cb", label:"Combustível",   value:form.nivelCombustivel }),
        ]),

        h("div", { key:"saccb", style: sty.secBar }, "ACESSÓRIOS E EQUIPAMENTOS (S=Existente | N=Não existente | A=Avariado)"),
        h("div", { key:"accgrd", style: sty.snaGrid },
            ACESSORIOS.map(([id,label]) => hs("div", { key:id, style: sty.snaItem }, [
                h("span", { key:"l", style: { flex:1 } }, label),
                h("span", { key:"v", style: { fontWeight:900, minWidth:"14px" } }, form.acessorios[id] || "—"),
            ]))
        ),

        h("div", { key:"spreib", style: sty.secBar }, "RESPONSÁVEL"),
        hs("div", { key:"sgpre", style: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px", border:"1px solid #aaa", padding:"6px 8px", marginBottom:"6px" } }, [
            // Assinatura
            hs("div", { key:"pre" }, [
                h("div", { key:"l", style: sty.lbl }, `RESPONSÁVEL${si.prestadorNome ? ` — ${si.prestadorNome}` : ""}`),
                si.prestadorAssinatura && si.prestadorAssinatura.startsWith("data:")
                    ? h("img", { key:"sig", src:si.prestadorAssinatura, style:{ maxHeight:"55px", marginTop:"4px" } })
                    : h("div", { key:"l2", style: { marginTop:"35px", borderTop:"1px solid #aaa" } }),
            ]),
            // Declaração
            h("div", { key:"decl", style: { padding:"6px 8px", background:"#fffbeb", border:"1px solid #fde68a", borderRadius:"3px", fontSize:"8px", color:"#78350f", fontWeight:600, lineHeight:"1.5", alignSelf:"center" } },
                "Declaro estar ciente que o veículo foi devidamente vistoriado e todos os objetos pertencentes relacionados, estando de acordo com todas as informações contidas neste formulário."
            ),
        ]),
    ]);
}
