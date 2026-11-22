type FeatureKind = "payment" | "time" | "phone" | "spark" | "shield" | "check";

function featureKind(title: string): FeatureKind {
  const value = title.toLowerCase();
  if (/заработ|доход|оплат|выплат|вознагражд/.test(value)) return "payment";
  if (/врем|час|минут|график/.test(value)) return "time";
  if (/компьютер|телефон|смартфон|устройств/.test(value)) return "phone";
  if (/для всех|возможност|доступн|начать/.test(value)) return "spark";
  if (/услов|защит|безопас|требован/.test(value)) return "shield";
  return "check";
}

function FeatureIcon({ kind }: { kind: FeatureKind }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "payment" && <><path d="M19 7V4H6a3 3 0 0 0 0 6h15v9a2 2 0 0 1-2 2H6a3 3 0 0 1-3-3V7" /><path d="M21 13h-5v5h5M17.5 15.5h.01" /></>}
    {kind === "time" && <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
    {kind === "phone" && <><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10 5h4m-3 13.5h2" /></>}
    {kind === "spark" && <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" /><path d="m20 3 .5 1.5L22 5l-1.5.5L20 7l-.5-1.5L18 5l1.5-.5L20 3Z" strokeWidth="1.1" /></>}
    {kind === "shield" && <><path d="M12 3 4.5 6v5.5c0 4.5 3.2 7.5 7.5 9.5 4.3-2 7.5-5 7.5-9.5V6L12 3Z" /><path d="m8.5 11.5 2.5 2.5 4.5-5" /></>}
    {kind === "check" && <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>}
  </svg>;
}

export function HeroFeatures({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return null;

  return <ul className="hero-intro hero-features" role="list">
    {lines.map((line, index) => {
      const colon = line.indexOf(":");
      const title = (colon >= 0 ? line.slice(0, colon) : line).trim();
      const description = colon >= 0 ? line.slice(colon + 1).trim() : "";
      return <li className="hero-feature" key={`${index}-${title}`}>
        <span className="hero-feature-icon"><FeatureIcon kind={featureKind(title)} /></span>
        <p className="hero-feature-copy"><strong>{title}{colon >= 0 && ":"}</strong>{description && <>{" "}<span>{description}</span></>}</p>
      </li>;
    })}
  </ul>;
}
