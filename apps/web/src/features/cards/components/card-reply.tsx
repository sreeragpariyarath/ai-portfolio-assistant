import type { CardKind } from "@/features/cards/portfolio-cards";
import { ContactCardView } from "./contact-card";
import { ProfileCardView } from "./profile-card";
import { ProjectCarousel } from "./project-cards";
import { SkillsCardView } from "./skills-card";

// A stored reply: one sentence, then the card. Nothing here talks to the assistant.
export function CardReply({ text, card, animate = false }: { text: string; card: CardKind; animate?: boolean }) {
  return (
    <div data-animate={animate} className={`text-[0.95rem] leading-relaxed text-neutral-800 ${animate ? "anim-rise" : ""}`}>
      {card === "profile" ? (
        <>
          <ProfileCardView />
          <p className="mt-6 whitespace-pre-line">{text}</p>
        </>
      ) : (
        <p className="mb-3">{text}</p>
      )}
      {card === "projects" ? <ProjectCarousel /> : null}
      {card === "skills" ? <SkillsCardView /> : null}
      {card === "contact" ? <ContactCardView /> : null}
    </div>
  );
}
