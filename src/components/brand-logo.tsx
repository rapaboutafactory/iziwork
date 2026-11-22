export function BrandLogo({ decorative = false, priority = false, className = '' }: { decorative?: boolean; priority?: boolean; className?: string }) {
 return <img className={`iziwork-logo ${className}`.trim()} src="/brand/iziwork-logo.svg" width={1016} height={616} alt={decorative ? '' : 'IziWork'} draggable={false} decoding="async" fetchPriority={priority ? 'high' : undefined}/>;
}
