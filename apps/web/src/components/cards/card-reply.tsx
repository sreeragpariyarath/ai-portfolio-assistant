import type { CardKind } from "@/lib/portfolio-cards";
import { ContactCardView } from "./contact-card";
import { ProfileCardView } from "./profile-card";
import { ProjectCarousel } from "./project-cards";
import { SkillsCardView } from "./skills-card";

// A stored reply: one sentence, then the card. Nothing here talks to the assistant.
export function CardReply({ text, card }: { text: string; card: CardKind }) {
  return (
    <div className="text-[0.95rem] leading-relaxed text-neutral-800">
      <p className="mb-3">{text}</p>
      {card === "profile" ? <ProfileCardView /> : null}
      {card === "projects" ? <ProjectCarousel /> : null}
      {card === "skills" ? <SkillsCardView /> : null}
      {card === "contact" ? <ContactCardView /> : null}
    </div>
  );
}
