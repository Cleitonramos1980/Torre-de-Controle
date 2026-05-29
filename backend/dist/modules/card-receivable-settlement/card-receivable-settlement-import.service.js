import { createHash } from "node:crypto";
export class CardReceivableSettlementImportService {
    buildFilePayload(fileName, buffer, uploadedBy) {
        const fileHash = createHash("sha256").update(buffer).digest("hex");
        return {
            fileName,
            fileHash,
            fileSize: buffer.length,
            uploadedBy: uploadedBy || "system",
            uploadedAt: new Date().toISOString(),
        };
    }
}
