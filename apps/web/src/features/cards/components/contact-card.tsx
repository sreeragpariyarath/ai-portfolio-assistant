"use client";

import { useState } from "react";
import { CONTACT } from "@/features/cards/portfolio-cards";
import { linkDisplay } from "@/features/cards/contact-links";
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
    <section aria-labelledby="contact-card-title" className={`${CARD_SURFACE} mx-auto w-full max-w-[40rem] px-8 py-5`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id="contact-card-title" className="text-lg font-bold text-neutral-950">
          Get in touch
        </h2>
        <p className="flex items-center gap-2 text-sm text-neutral-600">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-500" />
          {CONTACT.note}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Email</p>
          <a
            href={`mailto:${CONTACT.email}`}
            className="mt-0.5 block rounded text-xl font-semibold break-all text-neutral-950 underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
          >
            {CONTACT.email}
          </a>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={`mailto:${CONTACT.email}`}
            className="glass-send inline-flex items-center rounded-full px-5 py-1.5 text-sm font-medium text-white transition-[filter] duration-200 hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 motion-reduce:transition-none"
          >
            Send email
          </a>
          <button type="button" onClick={() => void copyEmail()} className={LINK_PILL}>
            {copied ? "Copied" : "Copy"}
            <span className="sr-only"> email address</span>
          </button>
          <span className="sr-only" role="status">
            {copied ? "Email address copied" : ""}
          </span>
        </div>
      </div>

      <ul className="mt-3.5 divide-y divide-neutral-200/70 border-t border-neutral-200/70" aria-label="Profiles and links">
        {CONTACT.links.map((link, index) => (
          <li key={link.href} className="stagger-item" style={{ "--i": index + 1 } as React.CSSProperties}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group -mx-2 flex items-center justify-between gap-4 rounded-xl px-2 py-2 text-left transition-colors hover:bg-neutral-900/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
            >
              <span className="font-medium text-neutral-900">{link.label}</span>
              <span className="flex min-w-0 items-center gap-2 text-sm text-neutral-600">
                <span className="truncate">{linkDisplay(link.href)}</span>
                <ExternalIcon />
              </span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
