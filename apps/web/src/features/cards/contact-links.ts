// How a contact link is shown next to its label: the host and path without "https://www." and a trailing slash,
// for example "linkedin.com/in/example". Falls back to the raw text if the address cannot be parsed.
export function linkDisplay(href: string): string {
  try {
    const url = new URL(href);
    const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
    return `${url.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return href;
  }
}
