/**
 * @module services/browser/fonts
 * On-demand loader for decorative Google Fonts used on stylized typographic book covers.
 */

interface WindowWithFontFlag extends Window {
    __coverFontsLoaded?: boolean;
}

const COVER_FONTS_HREF =
    'https://fonts.googleapis.com/css2?family=Antonio:wght@100;300;700&family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,800;1,6..96,400;1,6..96,700&family=Cinzel+Decorative:wght@700;900&family=Cinzel:wght@600;800;900&family=DM+Serif+Display:ital@0;1&family=Inter:wght@300;400;500;600;700&family=Merriweather:ital,wght@0,300;0,400;0,700;1,300;1,400&family=Oswald:wght@300;400;600&family=Pinyon+Script&family=Playfair+Display:ital,wght@0,600;0,800;1,400;1,700&family=Prata&family=Space+Grotesk:wght@600;700&family=Syne:wght@700;800&family=Unbounded:wght@700;900&display=swap';

/** Injects the decorative cover fonts stylesheet once into `document.head`. */
export function ensureCoverFontsLoaded(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const win = window as WindowWithFontFlag;
    if (win.__coverFontsLoaded) return;
    win.__coverFontsLoaded = true;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = COVER_FONTS_HREF;
    document.head.appendChild(link);
}
