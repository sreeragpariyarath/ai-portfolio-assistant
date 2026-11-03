"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { ProjectCard } from "@/features/cards/portfolio-cards";
import { PROJECTS } from "@/features/cards/portfolio-cards";
import { recordPath } from "@/features/records/records";
import { CARD_SURFACE, ExternalIcon, LINK_PILL, Pill } from "./card-shell";

// The picture of a project: the owner's image when there is one, otherwise a soft gradient with the
// project's initial, so the cards look finished before the real pictures arrive.
function ProjectArt({ project, className, showLetter = true }: { project: ProjectCard; className: string; showLetter?: boolean }) {
  if (project.image !== undefined) {
    return (
      <Image
        src={project.image}
        alt=""
        width={750}
        height={1000}
        unoptimized
        className={`${className} object-cover`}
        style={project.imagePosition === undefined ? undefined : { objectPosition: project.imagePosition }}
      />
    );
  }
  return (
    <div className={`${className} relative overflow-hidden`} style={{ backgroundImage: `linear-gradient(135deg, ${project.colors[0]}, ${project.colors[1]})` }} aria-hidden="true">
      <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-white/25" />
      <div className="absolute -bottom-10 left-6 h-28 w-28 rounded-full bg-white/20" />
      {showLetter ? <span className="absolute bottom-3 left-4 text-5xl leading-none font-black text-white/80 select-none">{project.title.charAt(0)}</span> : null}
    </div>
  );
}

// The project's outside links and its source record. Shown under the picture on a wide screen and under the text on a phone.
function ProjectLinks({ project, className }: { project: ProjectCard; className: string }) {
  return (
    <div className={className}>
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
      className="glass-panel m-auto max-h-[92dvh] w-[min(94vw,54rem)] overflow-y-auto overscroll-contain rounded-3xl p-0 text-neutral-800 backdrop:bg-neutral-900/25 backdrop:backdrop-blur-md"
    >
      <div className="relative grid sm:grid-cols-[16rem_1fr]">
        <div className="p-2 sm:p-3">
          <ProjectArt project={project} className="h-40 w-full overflow-hidden rounded-[1.25rem] sm:aspect-[3/4] sm:h-auto" />
          <ProjectLinks project={project} className="mt-3 hidden flex-col items-start gap-2 sm:flex" />
        </div>
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          aria-label="Close project details"
          className="glass-card absolute top-5 right-5 z-10 flex h-9 w-9 items-center justify-center rounded-full text-neutral-800 transition-colors hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <div className="p-5 sm:py-7 sm:pr-14 sm:pl-5">
          <p className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">{project.period}</p>
          <h2 id={titleId} className="mt-1 text-xl font-bold text-neutral-950">
            {project.title}
          </h2>
          <p className="mt-1 text-sm text-neutral-600">{project.tagline}</p>
          <p className="mt-4 text-[0.95rem] leading-relaxed text-neutral-700">{project.description}</p>

          <h3 className="mt-5 text-xs font-semibold tracking-wide text-neutral-600 uppercase">Highlights</h3>
          <ul className="glass-inset mt-2 space-y-2 rounded-2xl p-4 text-[0.95rem] text-neutral-700">
            {project.highlights.map((highlight) => (
              <li key={highlight} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-800" />
                {highlight}
              </li>
            ))}
          </ul>

          <h3 className="mt-5 text-xs font-semibold tracking-wide text-neutral-600 uppercase">Built with</h3>
          <dl className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {project.stack.map((group) => (
              <div key={group.group}>
                <dt className="text-xs font-medium text-neutral-500">{group.group}</dt>
                <dd className="mt-1.5">
                  <ul className="flex flex-wrap gap-2">
                    {group.items.map((item) => (
                      <li key={item}>
                        <Pill>{item}</Pill>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>

          <ProjectLinks project={project} className="mt-6 flex flex-wrap gap-2 sm:hidden" />
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
  "flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white/70 text-neutral-700 transition-colors hover:bg-white hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:pointer-events-none disabled:opacity-35";

// A row of project cards that scrolls and snaps sideways; pressing a card opens its details.
export function ProjectCarousel() {
  const [open, setOpen] = useState<ProjectCard | null>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const track = useRef<HTMLUListElement>(null);

  // Tells the arrows when there is nothing more to scroll to.
  function updateEdges() {
    const element = track.current;
    if (element === null) return;
    setEdges({ start: element.scrollLeft <= 2, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2 });
  }

  useEffect(() => {
    updateEdges();
    window.addEventListener("resize", updateEdges);
    return () => window.removeEventListener("resize", updateEdges);
  }, []);

  function scrollBy(direction: -1 | 1) {
    const element = track.current;
    if (element === null) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <section aria-labelledby="projects-card-title">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="projects-card-title" className="text-lg font-bold text-neutral-950">
          Projects
        </h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => scrollBy(-1)} disabled={edges.start} aria-label="Previous projects" className={ARROW_BUTTON}>
            <Arrow direction="previous" />
          </button>
          <button type="button" onClick={() => scrollBy(1)} disabled={edges.end} aria-label="Next projects" className={ARROW_BUTTON}>
            <Arrow direction="next" />
          </button>
        </div>
      </div>

      <ul
        ref={track}
        onScroll={updateEdges}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto scroll-smooth px-4 pt-2 pb-10 -mb-5 [mask-image:linear-gradient(to_right,transparent,#000_14px,#000_calc(100%-14px),transparent)] [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"
      >
        {PROJECTS.map((project, index) => (
          <li key={project.id} className="stagger-item w-[min(15.75rem,72vw)] shrink-0 snap-start" style={{ "--i": index } as React.CSSProperties}>
            <button
              type="button"
              onClick={() => setOpen(project)}
              className={`${CARD_SURFACE} group relative block h-[22rem] w-full overflow-hidden text-left transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 motion-reduce:transition-none motion-reduce:hover:translate-y-0`}
            >
              <span className="absolute inset-0 block">
                <ProjectArt project={project} className="h-full w-full" showLetter={false} />
              </span>
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-3/5 bg-gradient-to-b from-black/60 via-black/25 to-transparent" />
              <span className="absolute inset-x-0 top-0 block p-5 text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
                <span className="block text-sm font-semibold">{project.period}</span>
                <span className="mt-1 block text-2xl leading-tight font-bold">{project.title}</span>
              </span>
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 block px-5 pb-5 text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]">
                <span className="line-clamp-2 block text-sm leading-snug font-medium">{project.tagline}</span>
                <span className="sr-only">View details for {project.title}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {open !== null ? <ProjectDialog project={open} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}
