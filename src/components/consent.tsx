"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    ym?: ((id: number, method: string, ...args: unknown[]) => void) & { a?: unknown[][]; l?: number };
    motivMetrikaInitialized?: string;
    motivLandingGoalSent?: boolean;
  }
}

function consentChoice(): "accepted" | "declined" | null {
  const value = document.cookie.split("; ").find((entry) => entry.startsWith("motiv_consent="))?.split("=")[1];
  return value === "accepted" || value === "declined" ? value : null;
}

function startMetrika(id: string) {
  if (!/^\d{1,12}$/.test(id) || window.motivMetrikaInitialized === id) return;
  window.motivMetrikaInitialized = id;
  const ym: NonNullable<Window["ym"]> = window.ym ?? Object.assign(function (...args: unknown[]) { (ym.a ??= []).push(args); }, { l: Date.now() });
  window.ym = ym;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://mc.yandex.ru/metrika/tag.js";
  script.dataset.motivMetrika = "true";
  document.head.appendChild(script);
  ym(Number(id), "init", { clickmap: false, trackLinks: false, accurateTrackBounce: true, webvisor: false, defer: true });
  // Explicit hit and goals avoid auto-pageview / client rerender double counting.
  ym(Number(id), "hit", window.location.origin + window.location.pathname);
  if (!window.motivLandingGoalSent) {
    ym(Number(id), "reachGoal", "landing_view");
    window.motivLandingGoalSent = true;
  }
}

export function Consent({ token, metrikaId }: { token: string; metrikaId?: string }) {
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    const choice = consentChoice();
    setVisible(choice === null || window.location.hash === '#privacy-settings');
    if (choice === 'accepted' && token) {
      // Renew the optional 30-minute session after a real page visit, using its fresh server token.
      void fetch('/api/consent', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({analytics:true,token})}).catch(() => {});
    }
    setAccepted(choice === "accepted");
    if (choice === "accepted" && metrikaId) startMetrika(metrikaId);
    const open = (event: MouseEvent) => {
      if ((event.target as Element).closest("[data-consent-settings]")) setVisible(true);
    };
    document.addEventListener("click", open);
    return () => document.removeEventListener("click", open);
  }, [metrikaId, token]);

  useEffect(() => {
    if (!accepted || !metrikaId || !/^\d{1,12}$/.test(metrikaId)) return;
    const clicked = (event: MouseEvent) => {
      const link = (event.target as Element).closest<HTMLAnchorElement>("a[data-social]");
      const network = link?.dataset.social;
      if (network && ["vk", "telegram", "max"].includes(network)) window.ym?.(Number(metrikaId), "reachGoal", `click_${network}`);
    };
    document.addEventListener("click", clicked);
    return () => document.removeEventListener("click", clicked);
  }, [accepted, metrikaId]);

  async function choose(analytics: boolean) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ analytics, token }), credentials: "same-origin" });
      if (!response.ok) throw new Error("Не удалось сохранить выбор. Попробуйте ещё раз.");
      setAccepted(analytics);
      setVisible(false);
      if (analytics && metrikaId) startMetrika(metrikaId);
      if (!analytics && window.motivMetrikaInitialized) window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить выбор.");
    } finally { setSaving(false); }
  }

  if (!visible) return null;
  return <section className="consent-panel" aria-labelledby="consent-title" role="region">
    <div className="consent-copy"><h2 id="consent-title">Ваш выбор — ваша приватность</h2><p>Разрешить сохранение аналитической сессии{metrikaId ? " и Яндекс.Метрику" : ""} для оценки рекламы? Без согласия доступны все функции сайта. <a href="/privacy">Подробнее</a></p>{error && <p className="consent-error" role="alert">{error}</p>}</div>
    <div className="consent-actions"><button type="button" onClick={() => void choose(false)} disabled={saving}>Только необходимые</button><button type="button" className="consent-accept" onClick={() => void choose(true)} disabled={saving}>{saving ? "Сохраняем…" : "Разрешить аналитику"}</button></div>
  </section>;
}
