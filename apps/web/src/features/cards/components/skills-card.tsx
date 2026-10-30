import { SKILL_GROUPS } from "@/features/cards/portfolio-cards";
import { CARD_SURFACE, Pill } from "./card-shell";

export function SkillsCardView() {
  return (
    <section aria-labelledby="skills-card-title" className={`${CARD_SURFACE} p-5 sm:p-6`}>
      <h2 id="skills-card-title" className="text-lg font-bold text-neutral-950">
        Skills
      </h2>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {SKILL_GROUPS.map((group, index) => (
          <div key={group.name} className="stagger-item" style={{ "--i": index } as React.CSSProperties}>
            <h3 id={`skills-group-${index}`} className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">
              {group.name}
            </h3>
            <ul aria-labelledby={`skills-group-${index}`} className="mt-2 flex flex-wrap gap-2">
              {group.skills.map((skill) => (
                <li key={skill}>
                  <Pill>{skill}</Pill>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
