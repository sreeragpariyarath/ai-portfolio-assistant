"use client";

import { useState } from "react";
import { CONTACT } from "@/features/cards/portfolio-cards";
import { CARD_SURFACE, ExternalIcon, LINK_PILL } from "./card-shell";

export function ContactCardView() {
  const [copied, setCopied] = useState(false);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(CONTACT.email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked; the address is still on screen and in the link.
    }
  }

  return (
    <section aria-labelledby="contact-card-title" className={`${CARD_SURFACE} p-5 sm:p-6`}>
      <h2 id="contact-card-title" className="text-lg font-bold text-neutral-950">
        Get in touch
      </h2>
      <p className="mt-1 text-sm text-neutral-600">Email is the quickest way to reach me.</p>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-neutral-50 p-3">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0171E3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="m3.5 7 8.5 6 8.5-6" />
        </svg>
        <a href={`mailto:${CONTACT.email}`} className="min-w-0 flex-1 rounded font-medium break-all text-neutral-900 underline decoration-neutral-300 underline-offset-4 hover:decoration-[#0171E3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0171E3]">
          {CONTACT.email}
        </a>
        <button type="button" onClick={() => void copyEmail()} className={LINK_PILL}>
          {copied ? "Copied" : "Copy"}
          <span className="sr-only"> email address</span>
        </button>
        <span className="sr-only" role="status">
          {copied ? "Email address copied" : ""}
        </span>
      </div>

      <ul className="mt-4 flex flex-wrap gap-2" aria-label="Profiles and links">
        {CONTACT.links.map((link, index) => (
          <li key={link.href} className="stagger-item" style={{ "--i": index + 1 } as React.CSSProperties}>
            <a href={link.href} target="_blank" rel="noopener noreferrer" className={LINK_PILL}>
              {link.label}
              <ExternalIcon />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
