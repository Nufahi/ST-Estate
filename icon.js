/**
 * Estate — inline SVG icons.
 *
 * One source for the mark, so the wand menu, the dialogs and the extensions
 * tab never drift apart. Font Awesome is deliberately not used here: its
 * house glyphs differ between the icon sets SillyTavern themes ship with,
 * which is exactly how the extension ended up wearing three faces.
 */

const NS = 'http://www.w3.org/2000/svg';

/** House with a chimney — the Estate mark. */
const HOUSE = [
    'M3 10.6 12 3.2l9 7.4',
    'M5.2 9.9V20a1 1 0 0 0 1 1h11.6a1 1 0 0 0 1-1V9.9',
    'M16.4 5.9V3.6h2.5v4.3',
    'M9.7 21v-6.1h4.6V21',
];

/** Civic building with a central tower — the places tab. */
const BUILDING = [
    'M2.5 21h19',
    'M5 21V9.4l4-2.6V21',
    'M19 21V9.4l-4-2.6V21',
    'M9 21V6.2l3-3.4 3 3.4V21',
    'M11 21v-3.6h2V21',
    'M11.2 9.3h1.6',
];

function draw(paths, className) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.7');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    if (className) svg.setAttribute('class', className);

    for (const definition of paths) {
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', definition);
        svg.appendChild(path);
    }
    return svg;
}

/**
 * @param {string} [className]
 * @returns {SVGSVGElement} the Estate house mark.
 */
export function houseIcon(className = 'est-icon') {
    return draw(HOUSE, className);
}

/**
 * @param {string} [className]
 * @returns {SVGSVGElement} the places mark.
 */
export function buildingIcon(className = 'est-icon') {
    return draw(BUILDING, className);
}

/**
 * Fill every `[data-estate-icon]` placeholder in a subtree. Used for the
 * settings template, which is fetched as HTML and cannot carry a live node.
 *
 * @param {ParentNode} root
 */
export function paintIcons(root) {
    for (const slot of root.querySelectorAll('[data-estate-icon]')) {
        const name = slot.getAttribute('data-estate-icon');
        slot.replaceChildren(name === 'building' ? buildingIcon() : houseIcon());
    }
}
