import { FUN } from "@/features/cards/portfolio-cards";
import { CARD_SURFACE, Pill } from "./card-shell";

// The stored "Fun" card: hobbies and interests as grouped tags, like the skills card. No assistant call.
export function FunCardView() {
  return (
    <section aria-labelledby="fun-card-title" className={`${CARD_SURFACE} p-5 sm:p-6`}>
      <h2 id="fun-card-title" className="text-lg font-bold text-neutral-950">
        {FUN.title}
      </h2>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {FUN.groups.map((group, index) => (
          <div key={group.name} className="stagger-item" style={{ "--i": index } as React.CSSProperties}>
            <h3 id={`fun-group-${index}`} className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">
              {group.name}
            </h3>
            <ul aria-labelledby={`fun-group-${index}`} className="mt-2 flex flex-wrap gap-2">
              {group.items.map((item) => (
                <li key={item}>
                  <Pill>{item}</Pill>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
