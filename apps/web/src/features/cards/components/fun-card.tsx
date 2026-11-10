import { FUN, type FunGroup } from "@/features/cards/portfolio-cards";
import { CARD_SURFACE } from "./card-shell";
import { FunArtwork } from "./fun-art";

// The items of a tile, drifting past in a strip. The list is drawn twice so the loop is seamless; the copy is
// hidden from screen readers. With reduced motion the strip stops and wraps instead (see globals.css).
function ItemStrip({ items }: { items: readonly string[] }) {
  const chip = "shrink-0 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white ring-1 ring-white/25 backdrop-blur-sm";
  return (
    <div className="fun-strip relative mt-3 overflow-hidden">
      <div className="fun-strip-track flex w-max gap-1.5">
        <ul className="flex gap-1.5">
          {items.map((item) => (
            <li key={item} className={chip}>
              {item}
            </li>
          ))}
        </ul>
        <ul aria-hidden="true" className="fun-strip-copy flex gap-1.5">
          {items.map((item) => (
            <li key={item} className={chip}>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// One interest: an animated illustration on a colour gradient, the name, the note and the items. Everything is
// visible at once; nothing has to be clicked.
function FunTile({ group, index }: { group: FunGroup; index: number }) {
  const [from, to] = group.colors;
  return (
    <li
      className={`fun-tile stagger-item relative flex min-h-52 flex-col overflow-hidden rounded-3xl p-4 text-white shadow-[0_10px_30px_-12px_rgba(0,0,0,0.45)] ${group.large ? "col-span-2" : ""}`}
      style={{ "--i": index, backgroundImage: `linear-gradient(135deg, ${from}, ${to})` } as React.CSSProperties}
    >
      {group.art === "space" ? <span aria-hidden="true" className="fun-stars absolute inset-0" /> : null}
      <FunArtwork art={group.art} className={`absolute ${group.large ? "top-2 right-4 h-36 w-36" : "-top-1 -right-1 h-20 w-20"} drop-shadow-[0_6px_12px_rgba(0,0,0,0.2)]`} />
      <h3 className="relative mt-auto pt-16 text-lg font-bold tracking-tight">{group.name}</h3>
      <p className={`relative mt-1 text-sm leading-snug text-white/90 ${group.large ? "max-w-[62%]" : ""}`}>{group.note}</p>
      <ItemStrip items={group.items} />
    </li>
  );
}

// The stored "Fun" card: hobbies and interests as a bento grid of illustrated tiles. No assistant call.
export function FunCardView() {
  return (
    <section aria-labelledby="fun-card-title" className={`${CARD_SURFACE} p-5 sm:p-6`}>
      <h2 id="fun-card-title" className="text-lg font-bold text-neutral-950">
        {FUN.title}
      </h2>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {FUN.groups.map((group, index) => (
          <FunTile key={group.name} group={group} index={index} />
        ))}
      </ul>
    </section>
  );
}
