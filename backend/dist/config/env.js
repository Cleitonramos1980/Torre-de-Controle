import "dotenv/config";
import { z } from "zod";
const weakSecretValues = new Set([
    "change-me",
    "dev-secret-key-change-in-production",
    "123",
    "123456",
    "password",
    "senha",
    "troque-por-uma-chave-com-32-caracteres-ou-mais",
    "troque-por-uma-senha-forte",
]);
const optionalEmail = z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), z.string().email().optional());
const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().default(3333),
    APP_PUBLIC_URL: z.string().url().optional(),
    JWT_SECRET_KEY: z.string().min(32, "JWT_SECRET_KEY deve ter no minimo 32 caracteres."),
    ORACLE_USER: z.string().optional(),
    ORACLE_PASSWORD: z.string().optional(),
    ORACLE_CONNECT_STRING: z.string().optional(),
    ORACLE_HOST: z.string().optional(),
    ORACLE_PORT: z.coerce.number().optional(),
    ORACLE_SERVICE_NAME: z.string().optional(),
    ORACLE_POOL_MIN: z.coerce.number().default(1),
    ORACLE_POOL_MAX: z.coerce.number().default(10),
    ORACLE_POOL_INCREMENT: z.coerce.number().default(1),
    ORACLE_POOL_ALIAS: z.string().default("sgqPool"),
    ORACLE_STMT_CACHE_SIZE: z.coerce.number().default(30),
    ORACLE_QUEUE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(5000),
    REDE_BASE_URL: z.string().url().optional(),
    REDE_AUTH_PATH: z.string().default("/oauth2/token"),
    REDE_SALES_PATH: z.string().default("/merchant-statement/v2/sales"),
    REDE_PAYMENTS_PATH: z.string().default("/merchant-statement/v1/payments"),
    REDE_PARENT_MERCHANT_ID: z.string().optional(),
    REDE_PARENT_COMPANY_NUMBER: z.string().optional(),
    REDE_SUBSIDIARIES: z.string().optional(),
    REDE_PAGE_SIZE: z.coerce.number().int().min(1).max(500).default(100),
    REDE_CLIENT_ID: z.string().optional(),
    REDE_CLIENT_SECRET: z.string().optional(),
    REDE_CHARGEBACK_CLIENT_ID: z.string().optional(),
    REDE_CHARGEBACK_CLIENT_SECRET: z.string().optional(),
    REDE_CHARGEBACK_DEFAULT_MERCHANT_ID: z.string().optional(),
    REDE_CHARGEBACK_NOTIFICATIONS_PATH: z.string().default("/chargeback/v2/notifications"),
    REDE_CHARGEBACK_SOLICITATIONS_PATH: z.string().default("/chargeback/v2/solicitations"),
    REDE_CHARGEBACK_HISTORY_PATH: z.string().default("/chargeback/v2/history"),
    REDE_CHARGEBACK_TIMEOUT_MS: z.coerce.number().default(15000),
    REDE_CHARGEBACK_RETRY_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
    REDE_CHARGEBACK_RETRY_BASE_DELAY_MS: z.coerce.number().int().min(100).max(5000).default(400),
    REDE_TIMEOUT_MS: z.coerce.number().default(15000),
    REDE_RETRY_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
    REDE_RETRY_BASE_DELAY_MS: z.coerce.number().int().min(100).max(5000).default(400),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
    OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
    OPENAI_TIMEOUT_MS: z.coerce.number().default(45000),
    OPENAI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: optionalEmail,
    SMTP_SECURE: z.coerce.boolean().default(false),
    SMTP_TIMEOUT_MS: z.coerce.number().default(15000),
    SMTP_RETRY_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
    RECONAI_OPERADORA_EMAIL: optionalEmail,
    RECONAI_MANAGER_EMAIL: optionalEmail,
    AUTOMATION_HIGH_VALUE_THRESHOLD: z.coerce.number().default(10000),
    AUTOMATION_ESCALATION_DAYS: z.coerce.number().int().min(1).default(7),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    UPLOAD_MAX_FILES: z.coerce.number().default(10),
    UPLOAD_MAX_FILE_SIZE_MB: z.coerce.number().default(25),
    AUTH_STATIC_PASSWORD: z.string().min(1, "AUTH_STATIC_PASSWORD nao pode ser vazia."),
    ALLOW_WEAK_AUTH_STATIC_PASSWORD: z.coerce.boolean().default(false),
});
export const env = envSchema.parse(process.env);
if (weakSecretValues.has(env.JWT_SECRET_KEY.trim().toLowerCase())) {
    throw new Error("JWT_SECRET_KEY esta usando um valor fraco/inseguro.");
}
const isProduction = env.NODE_ENV === "production";
const allowWeakAuthPassword = env.ALLOW_WEAK_AUTH_STATIC_PASSWORD && !isProduction;
const authPassword = env.AUTH_STATIC_PASSWORD.trim();
if (!allowWeakAuthPassword && authPassword.length < 8) {
    throw new Error("AUTH_STATIC_PASSWORD deve ter no minimo 8 caracteres.");
}
if (!allowWeakAuthPassword && weakSecretValues.has(authPassword.toLowerCase())) {
    throw new Error("AUTH_STATIC_PASSWORD esta usando um valor fraco/inseguro.");
}
export function hasOracleConfig() {
    return Boolean(env.ORACLE_USER && env.ORACLE_PASSWORD && (env.ORACLE_CONNECT_STRING || (env.ORACLE_HOST && env.ORACLE_PORT && env.ORACLE_SERVICE_NAME)));
}
export function getOracleConnectString() {
    if (env.ORACLE_CONNECT_STRING)
        return env.ORACLE_CONNECT_STRING;
    return `${env.ORACLE_HOST}:${env.ORACLE_PORT}/${env.ORACLE_SERVICE_NAME}`;
}
export function hasRedeConfig() {
    return Boolean(env.REDE_BASE_URL && env.REDE_CLIENT_ID && env.REDE_CLIENT_SECRET);
}
export function getRedeChargebackClientId() {
    return env.REDE_CHARGEBACK_CLIENT_ID || env.REDE_CLIENT_ID;
}
export function getRedeChargebackClientSecret() {
    return env.REDE_CHARGEBACK_CLIENT_SECRET || env.REDE_CLIENT_SECRET;
}
export function hasRedeChargebackConfig() {
    return Boolean(env.REDE_BASE_URL && getRedeChargebackClientId() && getRedeChargebackClientSecret());
}
export function hasOpenAiConfig() {
    return Boolean(env.OPENAI_API_KEY);
}
export function hasSmtpConfig() {
    return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASSWORD);
}
