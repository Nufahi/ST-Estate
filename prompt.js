/**
 * Estate — prompt assembly and reply parsing.
 *
 * The model is asked for JSON and nothing else, and is explicitly told not to
 * write regular expressions: it declares keyword stems with a mode, and
 * keys.js compiles those into patterns that are correct by construction.
 *
 * The `settings` object handed in here is the global preferences and the
 * chat's brief already merged by index.js. Nothing in this file needs to know
 * which half a field came from.
 */

import { SPLIT_SECTION, sectionsFor } from './catalog.js';
import { promptsFor } from './catalog.js';
import { coverList, customLabels, targetWords } from './settings.js';

const MAX_ENTRIES = 12;

/**
 * Keyword counts per entry. These are deliberately modest: every key is a
 * small JSON object, and asking for two dozen of them pushes the reply past
 * the token budget, at which point the tail — the keys themselves — is what
 * gets cut off. Bilingual keying doubles the list, so it gets the larger cap.
 */
const KEY_COUNTS = Object.freeze({
    both: { min: 6, max: 14 },
    en: { min: 4, max: 8 },
});

/** Absolute ceiling used when normalising a reply, whatever was asked for. */
const MAX_KEYS_PER_ENTRY = 24;

/**
 * Words added to the budget for each item on the must-cover list, and the
 * ceiling on that. A single entry is injected whole every time it fires, so
 * there is a length past which covering everything costs more context than
 * the coverage is worth; beyond it the items share the allowance instead.
 */
const COVER_WORDS = 45;
const COVER_WORDS_MAX = 360;

/** Rough token cost of one key spec object, used only to size the reply. */
const TOKENS_PER_KEY = 24;
/** Token cost of the title, room and visual fields plus JSON punctuation. */
const TOKENS_PER_ENTRY_OVERHEAD = 120;

/**
 * Reply contract handed to the model verbatim. The key examples follow the
 * chosen scripts: leaving Cyrillic in the sample while asking for English
 * keywords is an invitation to drift straight back to Russian.
 *
 * @param {boolean} bilingual
 * @returns {string}
 */
function schema(bilingual) {
    const keys = [
        '        { "mode": "stem",   "lang": "en", "value": "kitchen" },',
        '        { "mode": "exact",  "lang": "en", "value": "hall" },',
        '        { "mode": "group",  "lang": "en", "values": ["couch", "sofa", "settee"] },',
        '        { "mode": "suffix", "lang": "en", "value": "cook", "suffixes": ["s", "ed", "ing"] },',
    ];
    if (bilingual) {
        keys.push(
            '        { "mode": "stem",   "lang": "ru", "value": "кухн" },',
            '        { "mode": "group",  "lang": "ru", "values": ["диван", "кушетк"] },',
            '        { "mode": "exact",  "lang": "ru", "value": "дом" },',
        );
    }
    keys.push('        { "mode": "proper", "value": "Crimson Bar" }');

    // Field order is load-bearing. `content` is by far the longest field, and a
    // reply that runs out of tokens is cut from the end — so anything after the
    // prose is what gets lost. Keys come first: an entry without them can never
    // fire, which makes them the one field that must survive truncation.
    return [
        '{',
        '  "entries": [',
        '    {',
        '      "title": "the room, zone or place this entry describes — 1-3 words, no names of people",',
        '      "room": "which room, zone or aspect this entry covers, or \\"whole\\" for the entire place",',
        '      "keys": [',
        ...keys,
        '      ],',
        '      "visual": "comma-separated visual tags: materials, colours, light, notable objects",',
        '      "content": "the description itself"',
        '    }',
        '  ]',
        '}',
    ].join('\n');
}

const KEY_RULES = `KEYWORD RULES — read carefully, this is the part that usually goes wrong.

Never write a regular expression. Never write slashes, \\b, lookarounds or
character classes. Declare a bare word and a mode; the patterns are compiled
for you.

Modes:
  stem   — a word root without its ending. Matches every inflected form.
           "window" catches window, windows, windowsill.
           Use this for almost every ordinary noun.
  exact  — the whole word only, no other endings. Use it when a stem would
           bleed: "hall" as exact will not fire on "hallmark", and "base"
           will not fire on "baseball".
  group  — several near-synonyms that mean the same thing here. Supply
           "values" as an array. Each one still matches all forms.
  suffix — a word plus a listed set of endings, for irregular or awkward
           cases. Supply "suffixes".
  proper — a proper noun, used as literal text: a street, a bar, a district.

Give a stem, not a full word: "kitchen", not "kitchens". A stem must be at
least 4 characters, otherwise use exact.
A value is always a single word with no spaces — the only exception is
"proper", which may contain spaces.
Set "lang" to "ru" or "en" to match the script the value is written in.`;

/** Appended to KEY_RULES when only English keywords are wanted. */
const KEYS_EN_ONLY = `ENGLISH KEYWORDS ONLY. Every keyword value is written in
English, whatever language anything else uses. Set "lang" to "en" on all of
them. Proper nouns are the one exception — a name stays in whatever script it
is written in. Russian keywords will be discarded.`;

/** Appended to KEY_RULES when the entry must fire in either language. */
const KEYS_BILINGUAL = `BOTH LANGUAGES, ALWAYS. The chat may be in English or
in Russian, and the entry has to fire either way. For every concept you key
on, give the English keyword AND its Russian equivalent as two separate
entries in the list:

  { "mode": "stem", "lang": "en", "value": "kitchen" },
  { "mode": "stem", "lang": "ru", "value": "кухн" }

This is not optional and it is the mistake that gets made most often: a list
containing only English keywords is a failed reply. Roughly half of your
keywords must be Russian. Russian stems follow the same rule — give the root
without its ending: "кухн", not "кухня"; "кварти", not "квартира".

Pick the few concepts that genuinely identify this place and key on those.
A short, accurate list beats a long one.`;

function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * The coverage contract.
 *
 * A tag brief describes a kind of place, not a checklist, and models write
 * about whatever they find interesting: "studio flat" reliably produces the
 * bed and the sitting corner and no kitchen, no bathroom. Naming the omission
 * once at the end of a prompt does not fix it either — the instruction has to
 * be a countable obligation with the items enumerated, which is what this is.
 *
 * @param {string[]} items
 * @param {boolean} perEntry whether each item gets an entry of its own
 * @returns {string}
 */
function coverageRule(items, perEntry) {
    const numbered = items.map((item, index) => `  ${index + 1}. ${item}`).join('\n');
    return [
        `MUST BE DESCRIBED — ${items.length} item(s), all of them:`,
        numbered,
        '',
        'This list is not a suggestion and not a set of themes to gesture at.',
        'Every item above is described in concrete physical detail — not merely'
        + ' mentioned in passing, not implied by the presence of something near it.',
        perEntry
            ? 'Each item goes in whichever entry it belongs to. An item that fits none'
              + ' of the listed entries gets an entry of its own.'
            : 'Each item gets its own passage inside the entry.',
        'An item that is boring, small or unglamorous is still described: that is'
        + ' precisely why it was listed. A toilet, a hallway or a place shoes go'
        + ' gets the same specificity as anything else.',
        'If an item does not plausibly exist in a place like this, say where its'
        + ' function actually happens instead — a shared bathroom down the hall, a'
        + ' washbasin behind a curtain. Never silently drop it.',
        `Before finishing, check the text against all ${items.length} items and add whatever is missing.`,
    ].join('\n');
}

/** Human-readable brief assembled from the tag picks and the free-form field. */
function buildBrief(settings, mode) {
    const lines = [];
    for (const section of sectionsFor(mode)) {
        const fragments = promptsFor(
            section.id,
            settings.picks?.[section.id],
            customLabels(settings, section.id),
        );
        if (fragments.length) lines.push(`${section.en}: ${fragments.join('; ')}`);
    }
    const extra = clean(settings.extra);
    if (extra) lines.push(`Explicit requirements from the author: ${extra}`);
    return lines.join('\n');
}

/** Who lives here, or what the building is, in the words the model will use. */
function buildOccupancy(ctx, settings, mode) {
    const charName = clean(ctx.name2) || 'the character';
    const userName = clean(ctx.name1) || 'the user';

    if (mode === 'place') {
        const name = clean(settings.placeName);
        return name
            ? { subject: name, line: `Describe a building called "${name}". It is a location in the world of this roleplay, not anybody's home.` }
            : { subject: 'the building', line: 'Describe a building: a location in the world of this roleplay, not anybody\'s home.' };
    }

    if (settings.target === 'persona') {
        return { subject: userName, line: `This is the home of ${userName}.` };
    }
    if (settings.target === 'shared') {
        return { subject: `${charName} & ${userName}`, line: `This is the shared home of ${charName} and ${userName}. Show whose habits shaped which corner.` };
    }
    return { subject: charName, line: `This is the home of ${charName}.` };
}

/**
 * Only the context the user asked for, trimmed to something sane.
 *
 * Exported because the scout asks a different question of the same material,
 * and assembling it twice is how the two would drift apart.
 */
export function buildContext(ctx, settings, lore = '') {
    const parts = [];
    const fields = ctx.getCharacterCardFields?.() || {};

    if (settings.useCard && fields.description) {
        parts.push(`CHARACTER CARD\n${clean(fields.description).slice(0, 4000)}`);
    }
    if (settings.usePersona && fields.persona) {
        parts.push(`PERSONA\n${clean(fields.persona).slice(0, 2000)}`);
    }
    if (settings.useLore && lore) {
        parts.push(
            'ESTABLISHED LORE\nThis is what the world already says. Stay consistent with it: '
            + 'reuse its places, names and materials rather than inventing rivals to them.\n'
            + lore.slice(0, 6000),
        );
    }
    if (settings.useHistory && settings.historyCount > 0) {
        const visible = (ctx.chat || [])
            .filter(message => message && !message.is_system && typeof message.mes === 'string' && message.mes.trim())
            .slice(-settings.historyCount)
            .map(message => `${message.name || (message.is_user ? 'User' : 'Char')}: ${clean(message.mes)}`)
            .join('\n');
        if (visible) parts.push(`RECENT MESSAGES\n${visible.slice(-6000)}`);
    }
    return parts.join('\n\n');
}

/**
 * Build the full request for one generation.
 *
 * @param {object} settings
 * @param {{repair?: string, lore?: string}} [options] `repair` carries the
 *        parser error back to the model on the retry pass; `lore` is the text
 *        of the bound lorebooks, read by the caller because that is async.
 * @returns {{prompt: Array<{role: string, content: string}>, responseLength: number, mode: 'home'|'place', bilingual: boolean}}
 */
export function buildRequest(settings, options = {}) {
    const ctx = SillyTavern.getContext();
    const mode = settings.mode === 'place' ? 'place' : 'home';
    const bilingual = settings.keyLanguage !== 'en';
    const counts = bilingual ? KEY_COUNTS.both : KEY_COUNTS.en;
    const occupancy = buildOccupancy(ctx, settings, mode);
    const brief = buildBrief(settings, mode);
    const context = buildContext(ctx, settings, options.lore);

    const splitId = SPLIT_SECTION[mode];
    const perRoom = settings.granularity === 'rooms';
    const parts = promptsFor(splitId, settings.picks?.[splitId], customLabels(settings, splitId));
    const unit = mode === 'place' ? 'zone' : 'room';
    const cover = coverList(settings.cover);

    // A must-cover list competes with the word budget, and the budget wins:
    // told to fit ten subjects into 180 words, a model writes a sentence each
    // and calls it done, which is the omission again wearing a different hat.
    // Only the single-entry layout needs this — per-room entries already get
    // the full allowance apiece.
    const words = targetWords(settings)
        + (cover.length && !(perRoom && parts.length)
            ? Math.min(cover.length * COVER_WORDS, COVER_WORDS_MAX)
            : 0);

    const entryPlan = perRoom && parts.length
        ? `Write one entry per listed ${unit}: ${parts.join(', ')}. Add one short entry titled for the ${mode === 'place' ? 'building' : 'home'} as a whole that covers the structure, the approach and the overall impression.`
        : `Write a single entry covering the whole ${mode === 'place' ? 'building' : 'home'}. If the place has clearly distinct areas, give each its own paragraph inside that one entry.`;

    // Entry text is always English; only the keys are a choice, because they
    // are what decides whether a Russian chat can trigger the entry.
    const languageRule = 'Write "title", "content" and "visual" in English, always, whatever language the chat uses.';

    const subject = mode === 'place'
        ? 'You are a set designer writing reference material for a roleplay. You describe the buildings a story passes through.'
        : 'You are a set designer writing reference material for a roleplay. You describe where people live.';

    // Surface tags are the ones that read as a uniform: told "wood panelling"
    // and "tile", a model panels every wall in the house and tiles every floor,
    // and the result is a showroom rather than somewhere anyone lives. They are
    // a vocabulary to distribute, and saying so is what allows a monochrome
    // bathroom and a boarded hallway ceiling to come from the same brief.
    const surfaceSections = ['walls', 'floors', 'ceiling', 'furniture', 'textiles', 'colour_use', 'fixtures']
        .map(id => (mode === 'place' ? `venue_${id}` : id))
        .filter(id => (settings.picks?.[id] || []).length);

    const surfaceRule = surfaceSections.length ? [
        'SURFACES, FURNITURE AND COLOUR',
        '- The walls, floors, ceilings, furniture, fabrics and colour tags are a'
        + ' palette of materials to spend across the place, not one specification'
        + ' repeated in every room. Real homes are assembled over time and out of'
        + ' whatever was affordable that year.',
        '- Give different rooms different surfaces from the list: tile where a room'
        + ' gets wet, boards where it does not, the good floor where guests are'
        + ' received and the cheap one where they are not.',
        '- Where two tags conflict, that is a boundary, not a mistake. Put them in'
        + ' different rooms and let the change be visible in the doorway.',
        '- Say where one surface stops and the next begins: the line the tiling'
        + ' reaches, the strip of trim, the point the good flooring gave out.',
        '- Name the material and its state, not just the material: what it is, how'
        + ' worn, what colour it has gone, what it does underfoot or under a hand.',
        '',
    ] : [];

    const evidence = mode === 'place'
        ? '- The building is evidence of the people who use it: who built it, who maintains it, who has stopped bothering. Show wear where hands and feet actually go.'
        : '- The home is evidence of a person. Every choice should say something about who lives there — what they can afford, what they care about, what they have given up on.';

    const system = [
        subject,
        '',
        'You will receive a brief of tags and produce lorebook entries as JSON.',
        '',
        'HOW TO WRITE THE DESCRIPTION',
        `- Around ${words} words per entry. Prose, not bullet points.`,
        '- Concrete and specific. Name materials, worn spots, what is on the table, what does not work.',
        evidence,
        '- No praise, no atmosphere adjectives doing the work of detail. "A sagging corduroy sofa the colour of weak tea" beats "a cosy inviting sofa".',
        '- Present tense, no second person, no addressing the reader.',
        '- Do not invent plot, events or other people. Describe the place.',
        '',
        'THE VISUAL FIELD',
        '- "visual" is a comma-separated tag list for image generation: materials, surfaces, palette, light quality, the three or four objects that define the frame.',
        '- Always in English, even when the description is Russian. No sentences, only tags.',
        '- Example: "exposed red brick, black steel window frames, worn oak floor, brass floor lamp, low winter sun, dust in the light, olive velvet sofa".',
        '- Include the surfaces of the room this entry is about — wall, floor and'
        + ' ceiling material — not only the objects standing in it.',
        '',
        ...surfaceRule,
        'THE TITLE',
        // The entry list is a column of comments, and every character of a
        // title that repeats across all of them is a character stolen from the
        // part that differs. Whose place it is comes from a badge the extension
        // prefixes; the title carries the location and nothing else.
        '- "title" names the place itself: "Kitchen", "Back stairs", "Main hall".',
        '- Never put a person\'s name in the title, and never write "\'s home", '
        + '"the home of", "her flat" or any other statement of ownership. That is '
        + 'added afterwards and would only be said twice.',
        `- One to three words.${mode === 'place' ? ' Do not repeat the name of the building in every title.' : ''}`,
        '',
        entryPlan,
        `Produce at most ${MAX_ENTRIES} entries. Between ${counts.min} and ${counts.max} keywords each.`,
        languageRule,
        '',
        // Placed above the keyword rules rather than at the end: the coverage
        // contract is about the prose, and an instruction drifting away from
        // the material it governs is how the omissions started.
        ...(cover.length ? [coverageRule(cover, perRoom && parts.length > 0), ''] : []),
        KEY_RULES,
        '',
        bilingual ? KEYS_BILINGUAL : KEYS_EN_ONLY,
        '',
        'OUTPUT',
        'Reply with a single JSON object and nothing else. No prose before or after, no markdown fences.',
        'Write the fields in the order shown. "keys" comes before "content": an',
        'entry with no keywords can never fire, so it is the field that must not',
        'be the one you run out of room for.',
        schema(bilingual),
    ].join('\n');

    const userParts = [occupancy.line];

    // A named place is how the chat will refer to it, so the name has to be a
    // key or the entry never fires when someone says it by name.
    const placeName = mode === 'place' ? clean(settings.placeName) : '';
    if (placeName) {
        userParts.push(`Include { "mode": "proper", "value": "${placeName}" } in the keys of every entry.`);
    }

    if (brief) userParts.push(`BRIEF\n${brief}`);
    if (context) userParts.push(context);

    const instruction = clean(settings.instruction);
    if (instruction) userParts.push(`ADDITIONAL INSTRUCTION\n${instruction}`);

    if (options.repair) {
        userParts.push(
            `Your previous reply was rejected: ${options.repair}\n`
            + 'Reply again with the JSON object only. No fences, no commentary, all strings properly escaped. '
            + `Every entry needs its "keys" array filled in, ${counts.min} keywords at the very least, `
            + 'written before "content" so it cannot be the part that gets cut short.',
        );
    }

    // A must-cover item that matches no listed room is allowed an entry of its
    // own, so the count is not knowable in advance. It is counted in full here:
    // responseLength is a ceiling rather than a spend, and the failure it
    // guards against — a reply truncated before its keys — is the expensive one.
    const entryCount = perRoom && parts.length
        ? Math.min(parts.length + 1 + cover.length, MAX_ENTRIES)
        : 1;

    // The budget has to cover the keyword arrays, not just the prose. Sizing it
    // on word count alone is what left talkative models truncated mid-reply,
    // with the keys — the last field written — missing entirely.
    const proseTokens = Math.ceil(words * 2.6);
    const keyTokens = counts.max * TOKENS_PER_KEY;
    const perEntry = proseTokens + keyTokens + TOKENS_PER_ENTRY_OVERHEAD;
    const responseLength = Math.min(32768, Math.max(1536, perEntry * entryCount + 512));

    return {
        prompt: [
            { role: 'system', content: system },
            { role: 'user', content: userParts.join('\n\n') },
        ],
        responseLength,
        mode,
        bilingual,
    };
}

/**
 * Pull a JSON object out of a model reply that may be wrapped in fences,
 * prefaced with chatter, or truncated mid-string.
 *
 * @param {string} text
 * @returns {{ok: true, value: object} | {ok: false, error: string}}
 */
export function extractJson(text) {
    let source = String(text ?? '').trim();
    if (!source) return { ok: false, error: 'empty reply' };

    // Strip markdown fences, including the ```json opener.
    source = source.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();

    const start = source.indexOf('{');
    if (start < 0) return { ok: false, error: 'no JSON object in the reply' };
    source = source.slice(start);

    const direct = tryParse(source);
    if (direct.ok) return direct;

    const balanced = balance(source);
    if (balanced !== source) {
        const repaired = tryParse(balanced);
        if (repaired.ok) return repaired;
    }

    // Trailing commas are the single most common malformation.
    const decommaed = balance(source.replace(/,(\s*[}\]])/g, '$1'));
    const retry = tryParse(decommaed);
    if (retry.ok) return retry;

    return { ok: false, error: direct.error };
}

function tryParse(source) {
    try {
        const value = JSON.parse(source);
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return { ok: false, error: 'top level is not an object' };
        }
        return { ok: true, value };
    } catch (error) {
        return { ok: false, error: String(error?.message || error) };
    }
}

/**
 * Cut a truncated reply back to the last complete element and close every
 * open bracket, so a response that ran out of tokens still yields entries.
 */
function balance(source) {
    let depthCurly = 0;
    let depthSquare = 0;
    let inString = false;
    let escaped = false;
    let lastSafe = -1;

    for (let index = 0; index < source.length; index++) {
        const character = source[index];

        if (inString) {
            if (escaped) escaped = false;
            else if (character === '\\') escaped = true;
            else if (character === '"') inString = false;
            continue;
        }

        if (character === '"') inString = true;
        else if (character === '{') depthCurly++;
        else if (character === '}') depthCurly--;
        else if (character === '[') depthSquare++;
        else if (character === ']') depthSquare--;

        // A closing brace at array depth 1 ends one complete entry object.
        if (character === '}' && depthCurly >= 1) lastSafe = index;
        if (depthCurly === 0 && index > 0) return source.slice(0, index + 1);
    }

    if (!inString && depthCurly === 0 && depthSquare === 0) return source;
    if (lastSafe < 0) return source;

    let truncated = source.slice(0, lastSafe + 1);

    // Recount what is still open after the cut and close it.
    let curly = 0;
    let square = 0;
    let string = false;
    let escape = false;
    for (const character of truncated) {
        if (string) {
            if (escape) escape = false;
            else if (character === '\\') escape = true;
            else if (character === '"') string = false;
            continue;
        }
        if (character === '"') string = true;
        else if (character === '{') curly++;
        else if (character === '}') curly--;
        else if (character === '[') square++;
        else if (character === ']') square--;
    }
    truncated += ']'.repeat(Math.max(0, square)) + '}'.repeat(Math.max(0, curly));
    return truncated;
}

/**
 * Strip an owner out of an entry title.
 *
 * The prompt asks for the location alone, and models still return "Anna's
 * kitchen" or "Home of Anna — Kitchen" often enough to matter. The badge
 * already says whose place it is, so the name is a repetition on every row of
 * the lorebook list. Removed here rather than left to the review dialog: the
 * point of the badge is that nobody has to edit thirteen titles by hand.
 *
 * Only leading and trailing owner phrases go. A title that is *nothing* but a
 * name is kept, because whatever is left would be nothing at all.
 *
 * @param {string} title
 * @param {string[]} names
 * @returns {string}
 */
export function stripOwner(title, names = []) {
    let text = String(title || '').trim();

    const owners = names
        .map(name => String(name || '').trim())
        .filter(name => name.length > 1)
        .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    const owner = owners.length ? `(?:${owners.join('|')})` : null;
    const dwelling = '(?:home|house|apartment|flat|residence|dwelling|quarters|place|room)';
    const possessive = '(?:his|her|their|its|your|my|the\\s+character[\'’]s|the\\s+user[\'’]s)';

    const patterns = [
        // "Home of Anna — Kitchen", and the same without a name to match against.
        new RegExp(`^(?:the\\s+)?${dwelling}\\s+of\\s+[^—:|]{1,40}[\\s—:|-]*`, 'i'),
        // "Anna's flat: Bathroom" — the possessive plus the dwelling word.
        new RegExp(`^[^—:|]{1,40}[\'’]s\\s+${dwelling}[\\s—:|-]*`, 'i'),
        // "Her apartment - Hallway". A pronoun is a name the parser cannot know.
        new RegExp(`^${possessive}\\s+${dwelling}[\\s—:|-]*`, 'i'),
        new RegExp(`^${possessive}\\s+(?=\\S)`, 'i'),
    ];
    if (owner) {
        patterns.push(
            new RegExp(`^${owner}[\'’]s\\s+`, 'i'),
            new RegExp(`^${owner}\\s*[—:|-]\\s*`, 'i'),
            new RegExp(`\\s*[—:|(-]\\s*${owner}[\'’]?s?\\s*\\)?$`, 'i'),
        );
    }

    for (const pattern of patterns) {
        const stripped = text.replace(pattern, '').trim();
        // A title made entirely of the owner leaves nothing behind; keeping the
        // original is less wrong than writing an entry called "".
        if (stripped) text = stripped;
    }

    text = text.replace(/^[\s—:|-]+|[\s—:|-]+$/g, '').trim();

    // "Anna's home" reduces to "home", which is right but reads like a typo in
    // a list of titles that are otherwise capitalised.
    return text.replace(/^[a-z]/, letter => letter.toUpperCase());
}

/**
 * Validate and normalise the parsed reply into draft entries.
 * Keyword compilation happens later, in the preview layer, so the user can
 * still edit the raw stems before they become patterns.
 *
 * @param {object} value
 * @param {{englishOnly?: boolean, names?: string[]}} [options] `englishOnly`
 *        drops Cyrillic keywords the model produced despite being asked for
 *        English ones; `names` are the people whose name must not sit in a title.
 * @returns {{ok: true, entries: object[], keyless: number} | {ok: false, error: string}}
 */
export function normalizeEntries(value, options = {}) {
    const list = Array.isArray(value?.entries) ? value.entries : Array.isArray(value) ? value : null;
    if (!list) return { ok: false, error: '"entries" is missing or not an array' };

    const entries = [];
    let keyless = 0;

    for (const raw of list.slice(0, MAX_ENTRIES)) {
        if (!raw || typeof raw !== 'object') continue;

        const content = String(raw.content ?? '').trim();
        if (!content) continue;

        const title = stripOwner(
            String(raw.title ?? '').trim() || String(raw.room ?? '').trim(),
            options.names,
        ).slice(0, 120) || 'Home';

        const keys = normalizeKeySpecs(raw.keys, options.englishOnly === true);
        if (!keys.length) keyless++;

        entries.push({
            title,
            room: String(raw.room ?? '').trim().slice(0, 60),
            content,
            visual: String(raw.visual ?? '').trim().slice(0, 1200),
            keys,
        });
    }

    if (!entries.length) return { ok: false, error: 'no usable entries' };

    // An entry with no keywords is inert: it lands in the lorebook and never
    // fires. Reported rather than dropped, so the caller can ask again.
    return { ok: true, entries, keyless };
}

const CYRILLIC = /[А-Яа-яЁё]/;

/**
 * When English-only keys were asked for, models drift back to Russian anyway,
 * so a Cyrillic value is dropped here rather than compiled into a pattern
 * nobody asked for. Proper nouns keep whatever script they came in.
 */
function isRejectedScript(spec, englishOnly) {
    if (!englishOnly || spec.mode === 'proper') return false;
    const values = [spec.value, ...(spec.values || [])].filter(Boolean);
    return values.some(value => CYRILLIC.test(value));
}

/**
 * Coerce whatever the model called a key into the spec shape keys.js expects.
 *
 * The cap is applied last, after rejects are dropped. Slicing first meant a
 * model that led with Russian in English-only mode spent the whole allowance
 * on specs that were then discarded, leaving the entry with no keys at all.
 */
function normalizeKeySpecs(raw, englishOnly) {
    const list = Array.isArray(raw) ? raw : [];
    const specs = [];

    for (const item of list) {
        if (specs.length >= MAX_KEYS_PER_ENTRY) break;

        if (typeof item === 'string') {
            const value = item.trim();
            if (!value) continue;
            const spec = { mode: /\s/.test(value) ? 'proper' : 'stem', value };
            if (!isRejectedScript(spec, englishOnly)) specs.push(spec);
            continue;
        }
        if (!item || typeof item !== 'object') continue;

        const values = Array.isArray(item.values)
            ? item.values.map(value => String(value ?? '').trim()).filter(Boolean)
            : [];
        const value = String(item.value ?? '').trim();
        if (!value && !values.length) continue;

        const spec = { mode: String(item.mode ?? '').trim() || 'stem' };
        if (values.length) spec.values = values;
        if (value) spec.value = value;
        if (item.lang === 'ru' || item.lang === 'en') spec.lang = item.lang;
        if (Array.isArray(item.suffixes)) {
            spec.suffixes = item.suffixes.map(suffix => String(suffix ?? '').trim()).filter(Boolean);
        }
        if (!isRejectedScript(spec, englishOnly)) specs.push(spec);
    }

    return specs;
}
