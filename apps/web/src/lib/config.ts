import { chatUrl, resolveApiBaseUrl } from "./api-base-url.ts";

// Next inlines NEXT_PUBLIC_ variables at build time, and only for a literal `process.env.NAME`
// reference, so the variable is read here exactly once. Changing it needs a rebuild.
export const API_BASE_URL = resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);

export const CHAT_URL = chatUrl(API_BASE_URL);
