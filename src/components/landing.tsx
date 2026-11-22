import type { NetworkAvailability, SiteContent } from "@/lib/contracts";
import { Fragment } from "react";
import { Consent } from "./consent";
import { SocialLinks } from "./social-links";
import { ContactDialogProvider, ContactTrigger } from "./contact-dialog";
import { BankNotifications } from "./bank-notifications";
import { HeroFeatures } from "./hero-features";
import { optionalAnalyticsEnabled } from "@/lib/config";
import { BrandLogo } from "./brand-logo";

function HighlightText({ text, highlight }: { text: string; highlight: string }) {
  if (!highlight) return text;
  return text.split(highlight).map((part, index) => <Fragment key={index}>{index > 0 && <strong>{highlight}</strong>}{part}</Fragment>);
}

function HeroSubtitle({ text, highlight }: { text: string; highlight: string }) {
  const start = highlight ? text.indexOf(highlight) : -1;
  if (start < 0) return <p className="hero-subtitle">{text}</p>;
  return <p className="hero-subtitle">{text.slice(0, start)}<span className="hero-subtitle-line"><HighlightText text={text.slice(start)} highlight={highlight}/></span></p>;
}

export function Landing({ content, token, preview = false, available }: { content: SiteContent; token: string; preview?: boolean; available?: NetworkAvailability }) {
  return <div className="motiv-landing">
    <ContactDialogProvider title={content.contactTitle} text={content.contactText} closeLabel={content.contactCloseLabel} token={token} buttons={content.buttons} preview={preview} available={available}>
    <a className="landing-skip" href="#main">К содержимому</a>
    {preview && <div className="preview-ribbon" role="status">Предварительный просмотр · переходы и аналитика отключены</div>}
    <header className="landing-header landing-container">
      <a className="landing-brand" href={preview ? "#" : "/"} aria-label={`${content.brand} — главная`}><BrandLogo decorative priority/></a>
      <nav className="landing-nav" aria-label="Основная навигация">
        <ContactTrigger label={content.navStart} variant="header"/>
      </nav>
    </header>
    <main id="main">
      <section className="landing-hero landing-container" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="hero-eyebrow"><span className="status-dot" />{content.eyebrow}</div>
          <h1 id="hero-title">{content.title}<span className="hero-period">.</span></h1>
          <HeroSubtitle text={content.subtitle} highlight={content.subtitleHighlight}/>
          <ContactTrigger label={content.heroCta} variant="hero"/>
        </div>
        <BankNotifications brand={content.brand}/>
        <HeroFeatures text={content.intro}/>
      </section>

      <section className="landing-conversion landing-container" id="start" aria-labelledby="start-title">
        <div className="conversion-heading"><div><span className="section-eyebrow">{content.startLabel}</span><h2 id="start-title">{content.ctaTitle}</h2></div><div className="conversion-pitch"><svg className="coin-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M10 17V7h3a3 3 0 0 1 0 6H8m0 2h6"/></svg><p><HighlightText text={content.ctaText} highlight={content.ctaHighlight} /></p></div></div>
        <SocialLinks token={token} buttons={content.buttons} preview={preview} available={available}/>
      </section>

    </main>
    {!preview && optionalAnalyticsEnabled() && <Consent token={token} metrikaId={content.metrikaId} />}
    </ContactDialogProvider>
  </div>;
}
