import type { Metadata } from "next";
import Script from "next/script";
import { SITE } from "@/features/home/site";
import "./globals.css";

export const metadata: Metadata = {
  title: SITE.title,
  description: SITE.description,
};

// Cloudflare Web Analytics (D-046): page views and visits, no cookies and no personal data. The token is public
// by design (it only identifies the site). Loaded in idle time so it never slows the first paint.
const CF_ANALYTICS_TOKEN = "1e0ea18a9fe64d48bb06949a72653546";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">
        {children}
        <Script
          src="https://static.cloudflareinsights.com/beacon.min.js"
          strategy="lazyOnload"
          data-cf-beacon={JSON.stringify({ token: CF_ANALYTICS_TOKEN })}
        />
      </body>
    </html>
  );
}
