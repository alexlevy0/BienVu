// Shared URL-import attempts, across agencies, in UTC calendar periods.
// The import_budget trigger must enforce these same limits atomically.
export const URL_IMPORT_QUOTAS = {daily: 20, monthly: 300} as const;
