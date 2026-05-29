import { createHash, timingSafeEqual } from "node:crypto";
export function hashPassword(plainPassword) {
    return createHash("sha256").update(plainPassword, "utf8").digest("hex");
}
export function verifyPassword(plainPassword, storedHash) {
    const incomingHash = hashPassword(plainPassword);
    const a = Buffer.from(incomingHash, "utf8");
    const b = Buffer.from(storedHash, "utf8");
    if (a.length !== b.length)
        return false;
    return timingSafeEqual(a, b);
}
