import { termsIntro, termsSections } from '@/lib/terms';

export default function TermsContent() {
  return (
    <div className="bg-ink-soft border-2 border-ink-line p-5 max-h-80 overflow-y-auto text-sm leading-relaxed">
      <h3 className="font-display text-base text-accent mb-2 tracking-wider">
        TERMS & CONDITIONS
      </h3>
      <p className="font-display text-xs tracking-widest text-neutral-400 mb-2">
        INTRODUCTION
      </p>
      <p className="text-neutral-300 mb-4 whitespace-pre-line text-sm">
        {termsIntro}
      </p>

      <ol className="space-y-4">
        {termsSections.map((section, i) => (
          <li key={i}>
            <h4 className="font-display text-accent text-sm mb-2 tracking-wider">
              {i + 1}. {section.title.toUpperCase()}
            </h4>
            <ul className="space-y-1.5 text-neutral-300 list-disc pl-5">
              {section.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
