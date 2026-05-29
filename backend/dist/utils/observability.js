const httpMetrics = new Map();
const oracleMetrics = new Map();
function toFixedNumber(value) {
    return Number(value.toFixed(2));
}
export function trackHttpRequestMetric(input) {
    const key = `${input.method.toUpperCase()} ${input.route}`;
    const current = httpMetrics.get(key) ?? { count: 0, errorCount: 0, totalMs: 0, maxMs: 0 };
    current.count += 1;
    current.totalMs += input.durationMs;
    current.maxMs = Math.max(current.maxMs, input.durationMs);
    if (input.statusCode >= 400)
        current.errorCount += 1;
    httpMetrics.set(key, current);
}
export function trackOracleQueryMetric(input) {
    const key = input.queryLabel;
    const current = oracleMetrics.get(key) ?? { count: 0, errorCount: 0, totalMs: 0, maxMs: 0 };
    current.count += 1;
    current.totalMs += input.durationMs;
    current.maxMs = Math.max(current.maxMs, input.durationMs);
    if (!input.success)
        current.errorCount += 1;
    oracleMetrics.set(key, current);
}
export function getObservabilitySnapshot() {
    return {
        generatedAt: new Date().toISOString(),
        http: Array.from(httpMetrics.entries())
            .map(([route, metric]) => ({
            route,
            count: metric.count,
            errorCount: metric.errorCount,
            avgMs: toFixedNumber(metric.totalMs / Math.max(1, metric.count)),
            maxMs: toFixedNumber(metric.maxMs),
        }))
            .sort((a, b) => b.count - a.count),
        oracle: Array.from(oracleMetrics.entries())
            .map(([queryLabel, metric]) => ({
            queryLabel,
            count: metric.count,
            errorCount: metric.errorCount,
            avgMs: toFixedNumber(metric.totalMs / Math.max(1, metric.count)),
            maxMs: toFixedNumber(metric.maxMs),
        }))
            .sort((a, b) => b.count - a.count),
    };
}
