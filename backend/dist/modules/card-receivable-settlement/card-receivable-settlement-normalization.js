export function normalizeText(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/\s+/g, " ")
        .trim();
}
export function normalizeHeader(value) {
    return normalizeText(value).replace(/[^A-Z0-9]+/g, " ").trim();
}
export function normalizeDigits(value) {
    return String(value ?? "").replace(/\D/g, "");
}
function scientificToPlain(raw) {
    if (!/[eE]/.test(raw))
        return raw;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed))
        return raw;
    return parsed.toLocaleString("fullwide", {
        useGrouping: false,
        maximumFractionDigits: 20,
    });
}
function sanitizeNumberLike(value) {
    if (typeof value !== "number" || !Number.isFinite(value))
        return "";
    const plain = value.toLocaleString("fullwide", {
        useGrouping: false,
        maximumFractionDigits: 20,
    });
    return plain.replace(/[.,]\d+$/, "");
}
export function normalizeEstablishmentCode(value) {
    if (value == null)
        return "";
    if (typeof value === "number") {
        return normalizeDigits(sanitizeNumberLike(value));
    }
    const raw = String(value).trim();
    if (!raw || raw === "-")
        return "";
    const normalizedScientific = scientificToPlain(raw);
    return normalizeDigits(normalizedScientific);
}
export function normalizeName(value) {
    return normalizeText(value).replace(/[^A-Z0-9]+/g, " ").trim();
}
export function isPlaceholderEmpty(value) {
    if (value == null)
        return true;
    const raw = String(value).trim();
    if (!raw)
        return true;
    return raw === "-" || raw === "—";
}
export function asNullableString(value) {
    if (value == null)
        return null;
    const raw = String(value).trim();
    if (!raw || raw === "-")
        return null;
    return raw;
}
