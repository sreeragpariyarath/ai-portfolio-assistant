import Image from "next/image";
import { PROFILE } from "../portfolio-cards";
import { Pill } from "./card-shell";

// The profile header: a large photo on the left and the name, place, a short hello and tags on the right
// (stacked on a phone). The photo is the placeholder until the owner supplies a real one.
export function ProfileCardView() {
  const { photo } = PROFILE;
  return (
    <section aria-labelledby="profile-card-title" className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
      <div className="aspect-square w-full max-w-[14rem] shrink-0 overflow-hidden rounded-3xl bg-gradient-to-b from-sky-100 via-sky-50 to-white sm:max-w-[16rem]">
        <Image
          src={photo.src}
          alt={photo.alt}
          width={640}
          height={640}
          unoptimized
          className={`h-full w-full ${photo.placeholder ? "object-contain object-bottom" : "object-cover"}`}
        />
      </div>
      <div className="min-w-0 sm:pt-2">
        <h2 id="profile-card-title" className="text-3xl font-bold text-neutral-950">
          {PROFILE.name}
        </h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-neutral-600">
          <span>{PROFILE.headline}</span>
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-neutral-300" />
          <span>{PROFILE.location}</span>
        </p>
        <p className="mt-4 text-[0.95rem] leading-relaxed text-neutral-800">
          Hey <span aria-hidden="true">👋</span> {PROFILE.bio}
        </p>
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="At a glance">
          {PROFILE.facts.map((fact, index) => (
            <li key={fact} className="stagger-item" style={{ "--i": index } as React.CSSProperties}>
              <Pill>{fact}</Pill>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
