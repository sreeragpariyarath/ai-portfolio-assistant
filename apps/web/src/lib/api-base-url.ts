// Where the browser sends API calls. Pure logic with no imports, so the root test suite can run it.
//
// In production one Worker serves the web files and /api/*, so the base is empty and calls are
// same-origin (/api/chat). In local development the web app (port 3000) calls the Worker
// (port 8787), so the base is that Worker's origin and the Worker's CORS support applies (D-020).

export function resolveApiBaseUrl(raw: string | undefined): string {
  const value = raw?.trim() ?? "";
  if (value === "") return "";

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `NEXT_PUBLIC_API_BASE_URL is not a valid URL. Use an origin such as http://localhost:8787, or leave it empty for same-origin calls.`,
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must start with http:// or https://.");
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must not contain a username or password.");
  }
  if ((url.pathname !== "/" && url.pathname !== "") || url.search !== "" || url.hash !== "") {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must be an origin only, with no path, query or fragment.");
  }
  return url.origin;
}

export function chatUrl(baseUrl: string): string {
  return `${baseUrl}/api/chat`;
}
