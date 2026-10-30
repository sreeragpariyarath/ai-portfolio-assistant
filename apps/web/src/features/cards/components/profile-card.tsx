import Image from "next/image";
import { PROFILE } from "@/features/cards/portfolio-cards";
import { CARD_SURFACE, Pill } from "./card-shell";

export function ProfileCardView() {
  return (
    <section aria-labelledby="profile-card-title" className={`${CARD_SURFACE} overflow-hidden`}>
      <div className="h-20 bg-gradient-to-r from-sky-200 via-violet-200 to-pink-200" aria-hidden="true" />
      <div className="-mt-10 px-5 pb-5 sm:px-6">
        <div className="h-20 w-20 overflow-hidden rounded-full border-4 border-white bg-neutral-50 shadow-sm">
          <Image src="/avatar-placeholder.svg" alt={`Portrait of ${PROFILE.name} (placeholder)`} width={160} height={160} unoptimized className="h-full w-full object-cover object-top" />
        </div>
        <h2 id="profile-card-title" className="mt-3 text-xl font-bold text-neutral-950">
          {PROFILE.name}
        </h2>
        <p className="text-sm font-medium text-neutral-700">{PROFILE.headline}</p>
        <p className="mt-1 flex items-center gap-1 text-sm text-neutral-600">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
            <circle cx="12" cy="9.5" r="2.5" />
          </svg>
          {PROFILE.location}
        </p>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-neutral-700">{PROFILE.bio}</p>
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="At a glance">
          {PROFILE.facts.map((fact) => (
            <li key={fact}>
              <Pill>{fact}</Pill>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
