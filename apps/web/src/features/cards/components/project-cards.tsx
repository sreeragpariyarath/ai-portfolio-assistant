"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { ProjectCard } from "@/features/cards/portfolio-cards";
import { PROJECTS } from "@/features/cards/portfolio-cards";
import { recordPath } from "@/features/records/records";
import { CARD_SURFACE, ExternalIcon, LINK_PILL, Pill } from "./card-shell";

// The picture of a project: the owner's image when there is one, otherwise a soft gradient with the
// project's initial, so the cards look finished before the real pictures arrive.
function ProjectArt({ project, className }: { project: ProjectCard; className: string }) {
  if (project.image !== undefined) {
    return <Image src={project.image} alt="" width={640} height={360} unoptimized className={`${className} object-cover`} />;
  }
  return (
    <div className={`${className} relative overflow-hidden`} style={{ backgroundImage: `linear-gradient(135deg, ${project.colors[0]}, ${project.colors[1]})` }} aria-hidden="true">
      <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-white/25" />
      <div className="absolute -bottom-10 left-6 h-28 w-28 rounded-full bg-white/20" />
      <span className="absolute bottom-3 left-4 text-5xl leading-none font-black text-white/80 select-none">{project.title.charAt(0)}</span>
    </div>
  );
}

// A native dialog gives a focus trap, Esc to close, an inert page behind it and focus returning to the
// card that opened it. It is shown only while a project is chosen.
function ProjectDialog({ project, onClose }: { project: ProjectCard; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = `project-title-${project.id}`;

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    if (!element.open) element.showModal();
    return () => {
      if (element.open) element.close();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      // The content fills the whole dialog, so a click on the dialog itself is a click on the dimmed backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="m-auto max-h-[88dvh] w-[min(94vw,36rem)] overflow-y-auto overscroll-contain rounded-3xl border-0 bg-white p-0 text-neutral-800 shadow-2xl backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm"
    >
      <div>
        <div className="relative">
          <ProjectArt project={project} className="h-44 w-full sm:h-52" />
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close project details"
            className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-neutral-800 shadow-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="p-5 sm:p-6">
          <p className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">{project.period}</p>
          <h2 id={titleId} className="mt-1 text-xl font-bold text-neutral-950">
            {project.title}
          </h2>
          <p className="mt-1 text-sm text-neutral-600">{project.tagline}</p>
          <p className="mt-4 text-[0.95rem] leading-relaxed text-neutral-700">{project.description}</p>

          <h3 className="mt-5 text-xs font-semibold tracking-wide text-neutral-600 uppercase">Highlights</h3>
          <ul className="mt-2 space-y-1.5 text-[0.95rem] text-neutral-700">
            {project.highlights.map((highlight) => (
              <li key={highlight} className="flex gap-2">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-800" />
                {highlight}
              </li>
            ))}
          </ul>

          <h3 className="mt-5 text-xs font-semibold tracking-wide text-neutral-600 uppercase">Built with</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {project.tech.map((tech) => (
              <li key={tech}>
                <Pill>{tech}</Pill>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap gap-2">
            {project.links.map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className={LINK_PILL}>
                {link.label}
                <ExternalIcon />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ))}
            {project.recordId !== undefined ? (
              <a href={recordPath(project.recordId)} target="_blank" rel="noopener noreferrer" className={LINK_PILL}>
                Source record
                <ExternalIcon />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </dialog>
  );
}

function Arrow({ direction }: { direction: "previous" | "next" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={direction === "previous" ? "rotate-180" : ""}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

const ARROW_BUTTON =
  "flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 hover:border-neutral-800 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900";

// A row of project cards that scrolls and snaps sideways; pressing a card opens its details.
export function ProjectCarousel() {
  const [open, setOpen] = useState<ProjectCard | null>(null);
  const track = useRef<HTMLUListElement>(null);

  function scrollBy(direction: -1 | 1) {
    const element = track.current;
    if (element === null) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <section aria-labelledby="projects-card-title">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="projects-card-title" className="text-lg font-bold text-neutral-950">
          Projects
        </h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => scrollBy(-1)} aria-label="Previous projects" className={ARROW_BUTTON}>
            <Arrow direction="previous" />
          </button>
          <button type="button" onClick={() => scrollBy(1)} aria-label="Next projects" className={ARROW_BUTTON}>
            <Arrow direction="next" />
          </button>
        </div>
      </div>

      <ul ref={track} className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pt-1 pb-5 [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden">
        {PROJECTS.map((project, index) => (
          <li key={project.id} className="stagger-item w-[min(17rem,78vw)] shrink-0 snap-start" style={{ "--i": index } as React.CSSProperties}>
            <button
              type="button"
              onClick={() => setOpen(project)}
              className={`${CARD_SURFACE} group block h-full w-full overflow-hidden text-left transition-transform hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 motion-reduce:transition-none motion-reduce:hover:translate-y-0`}
            >
              <ProjectArt project={project} className="h-36 w-full" />
              <span className="block p-4">
                <span className="block text-xs font-semibold tracking-wide text-neutral-600 uppercase">{project.period}</span>
                <span className="mt-1 block text-base font-bold text-neutral-950">{project.title}</span>
                <span className="mt-1 block text-sm text-neutral-600">{project.tagline}</span>
                <span className="mt-3 flex flex-wrap gap-1.5">
                  {project.tech.slice(0, 3).map((tech) => (
                    <Pill key={tech}>{tech}</Pill>
                  ))}
                </span>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-neutral-900">
                  View details
                  <span className="sr-only"> for {project.title}</span>
                  <Arrow direction="next" />
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {open !== null ? <ProjectDialog project={open} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}
