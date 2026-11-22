type Bank = "sber" | "tbank" | "alfa";

/** Small code-native marks; no remote resources are loaded by the illustration.
 * T-Bank shield: official https://www.tbank.ru/about/brand/ SVG source.
 * Alfa mark: https://github.com/alfa-laboratory/icons,
 * packages/classic/src/LogoAlfabankMColorIcon.tsx.
 * Sber symbol: simplified circle/check treatment, informed by the bank's
 * public visual guide https://developers.sber.ru/docs/ru/sberid/guidebook.
 */
function BankMark({ bank }: { bank: Bank }) {
  if (bank === "tbank") return <svg viewBox="0 0 153.4072 153.4072" width="38" height="38" fill="none" aria-hidden="true">
    <path fill="#FFDD2D" d="M0 0h153.407196v77.152634c0 19.778549-10.551285 38.055214-27.679031 47.945526L76.703636 153.407013l-49.02446-28.308853C10.55108 115.207848 0 96.931183 0 77.152634V0Z" />
    <path fill="#333" fillRule="evenodd" clipRule="evenodd" d="M42.10178 40.607338v23.996109c3.281376-3.705444 9.247463-6.213287 16.068932-6.213287h7.413021v27.895218c0 7.421425-2.016415 13.917305-5.00827 17.490341h32.245071c-2.985595-3.57666-4.997398-10.064308-4.997398-17.476181V58.39016h7.413353c6.821464 0 12.787391 2.507843 16.068931 6.213287V40.607338H42.10178Z" />
  </svg>;
  if (bank === "alfa") return <svg viewBox="0 0 24 24" width="38" height="38" fill="none" aria-hidden="true">
    <path d="M0 12.08A12 12 0 1 0 11.92 0 12 12 0 0 0 0 12.08Z" fill="#ef3124" />
    <path d="M7 18h10v-2H7Zm3.64-7.69 1.35-4 1.27 4Zm3.11-4.73c-.27-.82-.59-1.46-1.67-1.46s-1.41.64-1.7 1.46L7.42 14h2l.68-2h3.78l.64 2h2.09Z" fill="#fff" />
  </svg>;
  return <svg viewBox="0 0 40 40" width="40" height="40" fill="none" aria-hidden="true">
    <rect width="40" height="40" rx="12" fill="#24B34B" />
    <path d="M31.3 18.7a11.4 11.4 0 1 1-6.8-9.1" stroke="#fff" strokeWidth="2.75" strokeLinecap="round" />
    <path d="m13.6 18.4 5.5 3.7L31 12.8" stroke="#fff" strokeWidth="2.75" strokeLinecap="square" strokeLinejoin="round" />
  </svg>;
}

const notices: { bank: Bank; name: string; amount: string }[] = [
  { bank: "sber", name: "Сбербанк", amount: "+3000 ₽" },
  { bank: "tbank", name: "Т-Банк", amount: "+5000 ₽" },
  { bank: "alfa", name: "Альфа-Банк", amount: "+10000 ₽" },
];

export function BankNotifications({ brand = "IziWork" }: { brand?: string }) {
  return <div className="hero-art bank-notifications" aria-hidden="true">
    <div className="bank-art-stage" aria-hidden="true">
      <div className="bank-art-shadow" />
      <div className="bank-art-form"><span /></div>
      <div className="bank-art-spark bank-art-spark-one" />
      <div className="bank-art-spark bank-art-spark-two" />
      {notices.map(({ bank, name, amount }) => <div className={`bank-notice bank-notice-${bank}`} key={bank}>
        <div className={`bank-notice-icon bank-notice-icon-${bank}`}><BankMark bank={bank} /></div>
        <div className="bank-notice-copy">
          <span className="bank-notice-name">{name}</span>
          <span className="bank-notice-description">Поступление от <b>{brand}</b></span>
          <span className="bank-notice-amount">{amount}</span>
        </div>
        <span className="bank-notice-check"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="m3.5 8 3 3 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
      </div>)}
    </div>
  </div>;
}
