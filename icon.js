/**
 * Estate — inline SVG icons.
 *
 * One source for the mark, so the wand menu, the dialogs and the extensions
 * tab never drift apart. Font Awesome is deliberately not used here: its
 * house glyphs differ between the icon sets SillyTavern themes ship with,
 * which is exactly how the extension ended up wearing three faces.
 *
 * The marks are solid silhouettes painted with `currentColor`, so they take
 * the colour of the text around them and stay legible on any theme instead of
 * fighting it with an accent. Cut-outs (door, windows) are holes in the same
 * path, resolved by `fill-rule="evenodd"` — that way a hole shows the surface
 * underneath rather than a hardcoded background colour.
 */

const NS = 'http://www.w3.org/2000/svg';

/** House with a chimney — the Estate mark. */
const HOUSE = [
    // Chimney, drawn first so the roof line cuts across its foot.
    'M16.5 4.1 H19.1 V8.6 L16.5 6.45 Z',
    // Roof and walls, with the doorway punched out.
    'M12 2.75 L22.6 11.45 H20.3 V21.5 H3.7 V11.45 H1.4 Z'
    + ' M10.25 21.5 V15.45 H13.75 V21.5 Z',
];

/** Civic building with a portico — the places tab. */
const BUILDING = [
    // Pediment and central block, with two window openings.
    'M12 2.3 L16.4 6.15 V21.4 H7.6 V6.15 Z'
    + ' M10.55 12.6 V9.35 H13.45 V12.6 Z'
    + ' M10.55 21.4 V16.1 H13.45 V21.4 Z',
    // Side wings.
    'M6.9 8.05 V21.4 H2.35 V11.45 Z',
    'M17.1 8.05 L21.65 11.45 V21.4 H17.1 Z',
    // Ground line the whole facade stands on.
    'M1.25 22.05 H22.75 V23.3 H1.25 Z',
];

function draw(paths, className) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('fill-rule', 'evenodd');
    svg.setAttribute('clip-rule', 'evenodd');
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
