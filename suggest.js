/**
 * Estate — the scout.
 *
 * The tag boards ask what a place looks like. This asks a question the boards
 * cannot: which places this story needs at all. The model reads the card, the
 * lore and the recent messages, names the buildings the roleplay keeps walking
 * into, and picks the tags for each one itself.
 *
 * What comes back is a brief per building, not a description. Each one is then
 * generated through the ordinary pipeline, one request at a time, so a list of
 * six places is six normal runs rather than one reply asked to carry six
 * buildings and truncated somewhere in the third.
 */

import { PLACE_SECTIONS, chipIds, labelsFor } from './catalog.js';
import { button, node } from './dom.js';
import { buildingIcon } from './icon.js';
import { language, t } from './i18n.js';
import { buildContext } from './prompt.js';
import { NAME_MAX, SUGGEST_LIMITS } from './settings.js';

/** Cap on the one-line reason shown beside each proposal. */
const WHY_MAX = 160;

/**
 * The sections the scout is allowed to fill in, with how many picks each takes.
 * Deliberately not the whole board: surfaces, fabrics and light fittings are
 * the difference between two taverns, and a model choosing them blind produces
 * the same tavern every time. It picks what identifies the building; the rest
 * is left empty, which the ordinary prompt already handles.
 */
const SCOUT_SECTIONS = Object.freeze(['venue', 'venue_role', 'venue_scale', 'venue_busy', 'venue_era', 'venue_condition', 'venue_style', 'venue_palette', 'venue_light', 'zones']);

const SECTION_BY_ID = new Map(PLACE_SECTIONS.map(section => [section.id, section]));

/**
 * The id menu handed to the model, one line per section.
 *
 * Ids rather than labels: what comes back is matched against the catalog and
 * anything unrecognised is dropped, so a model inventing "cosy_tavern" costs
 * one tag rather than the whole proposal.
 */
function tagMenu() {
    const lines = [];
    for (const id of SCOUT_SECTIONS) {
        const section = SECTION_BY_ID.get(id);
        if (!section) continue;
        const cap = section.multi ? `up to ${section.max || 3}` : 'exactly 1';
        lines.push(`${id} (${cap}): ${chipIds(id).join(' ')}`);
    }
    return lines.join('\n');
}

/**
 * Build the scouting request.
 *
 * The chat history is forced on regardless of the context toggles: the whole
 * question is which places this story has been to, and that is written in the
 * messages and nowhere else.
 *
 * @param {object} job settings and brief, already merged
 * @param {{lore?: string, count?: number}} [options]
 * @returns {{prompt: Array<{role: string, content: string}>, responseLength: number}}
 */
export function buildSuggestRequest(job, options = {}) {
    const ctx = SillyTavern.getContext();
    const count = Math.min(SUGGEST_LIMITS.max, Math.max(SUGGEST_LIMITS.min, Number(options.count) || 6));

    // History is the point of this request, so it is switched on and given a
    // floor — twenty messages is roughly where a scene's locations start being
    // visible at all.
    const context = buildContext(ctx, {
        ...job,
        useHistory: true,
        historyCount: Math.max(40, Number(job.historyCount) || 0),
    }, options.lore);

    const system = [
        'You are a location scout for a roleplay. You read what has been written so far and say which buildings the story needs written down.',
        '',
        'WHAT TO PROPOSE',
        `- Name up to ${count} buildings. Fewer is fine: only propose places this story actually uses.`,
        '- Prefer places already named or visited in the messages: the tavern they drink in, the temple on the hill, the office someone works at.',
        '- Then places the setting obviously implies and the story will reach: if they live in a garrison town, the barracks and the guardpost are coming.',
        '- Public and shared buildings only. Do not propose anybody\'s home or private flat — those are written elsewhere.',
        '- Do not propose the same building twice under two names.',
        '- If the story has been nowhere and implies nowhere, return an empty list rather than inventing a village.',
        '',
        'THE NAME',
        '- "name" is what the chat calls the place: "The Drowned Crow", "Saint Alma\'s", "the east barracks".',
        '- Use the name the messages already use, in the language they use it in. Invent one only when the place has none.',
        '- Keep it short. No descriptions in the name.',
        '',
        'THE REASON',
        '- "why" is one short clause saying where it came from: "they drink here every evening", "mentioned twice, never described".',
        '',
        'THE TAGS',
        '- Pick tag ids from the menu below and nothing else. An id you did not read there will be discarded.',
        '- Respect each section\'s count. A section you have nothing useful to say about is left out entirely.',
        '- Choose what makes this building itself, not what makes it pleasant.',
        '',
        'TAG MENU',
        tagMenu(),
        '',
        'OUTPUT',
        'Reply with a single JSON object and nothing else. No prose before or after, no markdown fences.',
        '{',
        '  "places": [',
        '    {',
        '      "name": "The Drowned Crow",',
        '      "why": "they drink here every evening",',
        '      "tags": { "venue": ["tavern"], "venue_busy": ["crowded"], "zones": ["main", "counter"] }',
        '    }',
        '  ]',
        '}',
    ].join('\n');

    const userParts = [`Read the material below and propose the buildings worth writing down. At most ${count}.`];
    if (context) userParts.push(context);

    const extra = String(job.extra || '').replace(/\s+/g, ' ').trim();
    if (extra) userParts.push(`The author also said:\n${extra}`);

    return {
        prompt: [
            { role: 'system', content: system },
            { role: 'user', content: userParts.join('\n\n') },
        ],
        // Small replies: a name, a clause and a handful of ids apiece. The
        // headroom on top is for reasoning models, which are refused outright
        // by the provider when they think their way through the whole
        // allowance before writing anything.
        responseLength: Math.min(16384, 220 * count + 4608),
        jsonSchema: suggestSchema(),
    };
}

/**
 * The structured-output schema for a scouting reply.
 *
 * `tags` is left as a free-form object: the sections it may carry are decided
 * by the catalog at runtime, and `strict` mode forbids the open shape that
 * needs. Everything that matters — a list, with a name on every item — is
 * constrained, and the tags are validated against the catalog anyway.
 */
function suggestSchema() {
    return {
        name: 'estate_places',
        description: 'Buildings this story should have written down.',
        value: {
            type: 'object',
            required: ['places'],
            properties: {
                places: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['name'],
                        properties: {
                            name: { type: 'string', description: 'What the chat calls the place.' },
                            why: { type: 'string', description: 'One short clause saying where it came from.' },
                            tags: { type: 'object', description: 'Tag ids from the menu, keyed by section id.' },
                        },
                    },
                },
            },
        },
    };
}

/**
 * Validate a scouting reply into proposals.
 *
 * Every tag is checked against the catalog and every section against its cap,
 * so a proposal reaching the board can only contain picks the board could have
 * produced by hand.
 *
 * @param {object} value parsed JSON
 * @returns {{ok: true, places: object[]} | {ok: false, error: string}}
 */
export function normalizeSuggestions(value) {
    const list = Array.isArray(value?.places)
        ? value.places
        : Array.isArray(value?.entries) ? value.entries : Array.isArray(value) ? value : null;
    if (!list) return { ok: false, error: '"places" is missing or not an array' };

    const places = [];
    const seen = new Set();

    for (const raw of list.slice(0, SUGGEST_LIMITS.max)) {
        if (!raw || typeof raw !== 'object') continue;

        const name = String(raw.name ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
        if (!name) continue;

        // Two proposals for one building would write the same place twice.
        const identity = name.toLowerCase();
        if (seen.has(identity)) continue;
        seen.add(identity);

        places.push({
            name,
            why: String(raw.why ?? '').replace(/\s+/g, ' ').trim().slice(0, WHY_MAX),
            picks: normalizePicks(raw.tags),
        });
    }

    if (!places.length) return { ok: false, error: 'no usable places' };
    return { ok: true, places };
}

/** Keep only ids the catalog knows, section by section, honouring each cap. */
function normalizePicks(raw) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const picks = {};

    for (const id of SCOUT_SECTIONS) {
        const section = SECTION_BY_ID.get(id);
        if (!section) continue;

        const valid = new Set(chipIds(id));
        const offered = Array.isArray(source[id])
            ? source[id]
            : typeof source[id] === 'string' ? [source[id]] : [];

        const kept = [];
        for (const item of offered) {
            const value = String(item ?? '').trim();
            if (!valid.has(value) || kept.includes(value)) continue;
            kept.push(value);
        }

        const cap = section.multi ? (section.max || kept.length) : 1;
        if (kept.length) picks[id] = kept.slice(0, cap);
    }

    return picks;
}

/** The tags the scout chose, as words, for the row the user reads. */
function describePicks(place, lang) {
    const labels = [];
    for (const id of SCOUT_SECTIONS) {
        labels.push(...labelsFor(id, place.picks[id], lang));
    }
    return labels;
}

/**
 * Show what the scout found and let the user tick what to write.
 *
 * Nothing is generated from here: the ticked list is handed back, and the
 * caller runs it through the ordinary pipeline one building at a time.
 *
 * @param {object[]} places
 * @returns {Promise<object[]|null>} the chosen places, or null if cancelled
 */
export async function openSuggestions(places) {
    const context = SillyTavern.getContext();
    const lang = language();
    const root = node('div', 'est-suggest');

    const title = node('div', 'est-title');
    const glyph = node('span', 'est-title__glyph');
    glyph.appendChild(buildingIcon());
    const heading = node('h3', '', t('suggestTitle'));
    heading.id = 'estate_suggest_title';
    title.append(glyph, heading);
    root.append(title, node('p', 'est-intro', t('suggestIntro')));

    const accept = button(t('suggestWrite'), 'fa-solid fa-wand-magic-sparkles');
    accept.classList.add('est-generate');

    const summary = node('div', 'est-summary');
    const toolbar = node('div', 'est-preview__toolbar');
    const selectAll = button(t('selectAll'), 'fa-solid fa-check-double');
    const selectNone = button(t('selectNone'), 'fa-solid fa-xmark');
    toolbar.append(summary, selectAll, selectNone);
    root.appendChild(toolbar);

    const rows = [];
    const updateSummary = () => {
        const active = rows.filter(row => row.enabled()).length;
        // Each ticked place is a request of its own, and that is the number
        // worth putting in front of someone before they press the button.
        summary.textContent = t('suggestSummary', { n: active, total: rows.length });
        accept.disabled = active === 0;
    };

    const list = node('div', 'est-suggest__list');
    places.forEach((place, index) => {
        const element = node('label', 'est-suggest__item');
        element.htmlFor = `estate_place_${index}`;

        const toggle = /** @type {HTMLInputElement} */ (node('input'));
        toggle.type = 'checkbox';
        toggle.id = `estate_place_${index}`;
        // Everything on by default: the list is a shortcut for the lazy, and
        // ticking six boxes by hand is the work it exists to remove.
        toggle.checked = true;
        toggle.addEventListener('change', () => {
            element.classList.toggle('est-suggest__item--off', !toggle.checked);
            updateSummary();
        });

        const body = node('div', 'est-suggest__body');
        body.appendChild(node('span', 'est-suggest__name', place.name));
        if (place.why) body.appendChild(node('span', 'est-suggest__why', place.why));

        const tags = describePicks(place, lang);
        if (tags.length) {
            const chips = node('div', 'est-suggest__tags');
            for (const label of tags) chips.appendChild(node('span', 'est-suggest__tag', label));
            body.appendChild(chips);
        } else {
            // A place with no tags still generates, from its name and the
            // board's own picks — worth saying so rather than looking broken.
            body.appendChild(node('span', 'est-suggest__why', t('suggestNoTags')));
        }

        element.append(toggle, body);
        rows.push({ element, toggle, enabled: () => toggle.checked, place });
        list.appendChild(element);
    });
    root.appendChild(list);

    const actions = node('div', 'est-actions');
    actions.appendChild(accept);
    root.append(node('p', 'est-hint', t('suggestHint')), actions);

    selectAll.addEventListener('click', () => {
        for (const row of rows) if (!row.toggle.checked) row.toggle.click();
    });
    selectNone.addEventListener('click', () => {
        for (const row of rows) if (row.toggle.checked) row.toggle.click();
    });

    updateSummary();

    const popup = new context.Popup(root, context.POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        okButton: t('cancel'),
        cancelButton: false,
    });
    popup.dlg?.setAttribute('aria-labelledby', heading.id);

    let chosen = null;
    accept.addEventListener('click', () => {
        const selected = rows.filter(row => row.enabled()).map(row => row.place);
        if (!selected.length) {
            toastr.info(t('toastNoPlacesPicked'), t('title'));
            return;
        }
        chosen = selected;
        popup.complete(context.POPUP_RESULT.AFFIRMATIVE);
    });

    await popup.show();
    return chosen;
}
