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
 * Keyword counts per entry. A key is now a bare word rather than an object,
 * so the list is cheap; the cap exists because a long keyword list makes an
 * entry fire on everything, not because of the token budget.
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

/** Rough token cost of one keyword string, used only to size the reply. */
const TOKENS_PER_KEY = 6;
/** Token cost of the title, room and visual fields plus JSON punctuation. */
const TOKENS_PER_ENTRY_OVERHEAD = 120;

/**
 * Headroom added on top of the prose budget, in tokens.
 *
 * Reasoning models spend the output allowance on thinking before a single
 * character of the answer exists, and providers answer that with a hard
 * error rather than a short reply: "the output token limit was exhausted by
 * model reasoning". A budget sized to the prose alone is therefore a budget
 * that fails outright on every thinking model, so the ceiling is raised well
 * past what the answer needs. It costs nothing when unused — `max_tokens` is
 * a limit, not a spend.
 */
const REASONING_HEADROOM = 4096;

/** Floor and ceiling on the reply budget, whatever the arithmetic says. */
const RESPONSE_MIN = 2048;
const RESPONSE_MAX = 32768;

/**
 * How many entries one request is allowed to carry.
 *
 * This is the single biggest cause of unusable replies. Asked for eleven
 * rooms at once, a model writes six well, hurries the rest, and truncates
 * somewhere in the middle of the eighth — and one broken string costs the
 * whole batch. Split into pieces of three, the same model returns four small
 * replies that all parse. It is slower, and it works, which is the trade
 * being made here deliberately.
 */
export const ENTRIES_PER_REQUEST = Object.freeze({ min: 1, max: 12, default: 3 });

/**
 * The structured-output schema, handed to providers that support one.
 *
 * This is the real fix for malformed JSON: with a schema in the payload the
 * model is constrained by the provider rather than asked politely, and the
 * shape simply cannot come back wrong. SillyTavern forwards it as
 * `response_format: json_schema` on OpenAI-style backends, as a tool on
 * Claude and as `responseSchema` on Gemini; the ones that cannot take it get
 * the schema pasted into the prompt instead, which is what the text contract
 * below is for.
 *
 * Keys are plain strings here, not objects. A mode-and-value object per
 * keyword was three times the tokens and the thing models most often got
 * wrong; the mode is now written as a prefix inside the string, which no
 * schema has to describe and no model has to nest.
 */
export function entriesSchema() {
    return {
        name: 'estate_entries',
        description: 'Lorebook entries describing one place.',
        strict: true,
        value: {
            type: 'object',
            additionalProperties: false,
            required: ['entries'],
            properties: {
                entries: {
                    type: 'array',
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['title', 'room', 'keys', 'visual', 'content'],
                        properties: {
                            title: { type: 'string', description: '1-3 words naming the room or zone. No personal names.' },
                            room: { type: 'string', description: 'Which room or zone this covers, or "whole".' },
                            keys: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'Trigger keywords, one word each, optionally prefixed with a mode: "kitchen", "=hall", "couch|sofa", "The Drowned Crow".',
                            },
                            visual: { type: 'string', description: 'Comma-separated visual tags in English.' },
                            content: { type: 'string', description: 'The description itself.' },
                        },
                    },
                },
            },
        },
    };
}

/**
 * Reply contract handed to the model verbatim, for backends with no schema
 * support. The key examples follow the chosen scripts: leaving Cyrillic in
 * the sample while asking for English keywords is an invitation to drift
 * straight back to Russian.
 *
 * @param {boolean} bilingual
 * @returns {string}
 */
function schema(bilingual) {
    const keys = bilingual
        ? '"kitchen", "кухн", "=hall", "=дом", "couch|sofa|settee", "диван|кушетк", "The Drowned Crow"'
        : '"kitchen", "=hall", "couch|sofa|settee", "The Drowned Crow"';

    // Field order is load-bearing. `content` is by far the longest field, and a
    // reply that runs out of tokens is cut from the end — so anything after the
    // prose is what gets lost. Keys come first: an entry without them can never
    // fire, which makes them the one field that must survive truncation.
    return [
        '{',
        '  "entries": [',
        '    {',
        '      "title": "the room or zone this entry describes — 1-3 words, no names of people",',
        '      "room": "which room or zone this entry covers, or \\"whole\\" for the entire place",',
        `      "keys": [${keys}],`,
        '      "visual": "comma-separated visual tags: materials, colours, light, notable objects",',
        '      "content": "the description itself"',
        '    }',
        '  ]',
        '}',
    ].join('\n');
}

const KEY_RULES = `KEYWORD RULES — plain strings, nothing clever.

Every keyword is one short string in the "keys" array. Never write a regular
expression, a slash, \\b, a lookaround or a character class, and never write
an object — the patterns are built for you from these strings.

Four forms, and that is all there is:
  kitchen              a word root without its ending. Matches every inflected
                       form: window catches window, windows, windowsill.
                       Use this for almost every ordinary noun.
  =hall                a leading "=" means the whole word only, no endings.
                       Use it where a root would bleed: =hall will not fire on
                       "hallmark", =base will not fire on "baseball".
  couch|sofa|settee    near-synonyms separated by "|". Each still matches all
                       its forms.
  The Drowned Crow     a proper noun, written with its spaces, used literally.

Give a root, not a full word: "kitchen", not "kitchens". A root shorter than
four characters is treated as a whole word anyway, so prefix it with "=".
No spaces inside a keyword unless it is a proper noun.`;

/** Appended to KEY_RULES when only English keywords are wanted. */
const KEYS_EN_ONLY = `ENGLISH KEYWORDS ONLY. Every keyword is written in
English, whatever language anything else uses. Proper nouns are the one
exception — a name stays in whatever script it is written in. Russian
keywords will be discarded.`;

/** Appended to KEY_RULES when the entry must fire in either language. */
const KEYS_BILINGUAL = `BOTH LANGUAGES, ALWAYS. The chat may be in English or
in Russian, and the entry has to fire either way. For every concept you key
on, give the English keyword AND its Russian equivalent as two separate
strings:

  "kitchen", "кухн"

This is not optional and it is the mistake that gets made most often: a list
containing only English keywords is a failed reply. Roughly half of your
keywords must be Russian. Russian keywords follow the same rule — give the
root without its ending: "кухн", not "кухня"; "кварти", not "квартира".

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
 * Break one place into the requests that will write it.
 *
 * A single-entry brief is one request and always was. A per-room brief used
 * to be one request too, and that is what has been failing: eleven rooms in
 * one reply is several thousand tokens of JSON, and one unescaped quote or
 * one token short of the closing brace takes the whole batch with it.
 *
 * So it is cut into pieces. Each piece asks for a handful of rooms, the
 * whole-place entry rides with the first, and a piece that comes back broken
 * costs only its own rooms. Slower — four requests where there was one — and
 * the entries actually arrive, which is the trade being made.
 *
 * @param {object} settings settings and brief, merged
 * @returns {Array<{rooms: string[], whole: boolean, index: number, total: number}>}
 */
export function planChunks(settings) {
    const mode = settings.mode === 'place' ? 'place' : 'home';
    const splitId = SPLIT_SECTION[mode];
    const perRoom = settings.granularity === 'rooms';
    const parts = promptsFor(splitId, settings.picks?.[splitId], customLabels(settings, splitId));

    if (!perRoom || !parts.length) return [{ rooms: [], whole: true, index: 0, total: 1 }];

    const size = clampChunkSize(settings.entriesPerRequest);
    const rooms = parts.slice(0, MAX_ENTRIES);

    const chunks = [];
    for (let start = 0; start < rooms.length; start += size) {
        chunks.push({ rooms: rooms.slice(start, start + size), whole: false });
    }

    // The whole-place entry is short and belongs with the first batch, where
    // it also sets the tone the later batches are told to match.
    if (chunks.length) chunks[0].whole = true;
    else chunks.push({ rooms: [], whole: true });

    return chunks.map((chunk, index) => ({ ...chunk, index, total: chunks.length }));
}

function clampChunkSize(value) {
    const number = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(number)) return ENTRIES_PER_REQUEST.default;
    return Math.min(ENTRIES_PER_REQUEST.max, Math.max(ENTRIES_PER_REQUEST.min, number));
}

/**
 * Build the full request for one generation.
 *
 * @param {object} settings
 * @param {{repair?: string, lore?: string, chunk?: object, noSchema?: boolean, budget?: number}} [options]
 *        `repair` carries the parser error back to the model on the retry
 *        pass; `lore` is the text of the bound lorebooks, read by the caller
 *        because that is async; `chunk` is one slice from `planChunks`;
 *        `budget` overrides the computed reply ceiling, which is how a run
 *        that died on the token limit asks again with more room.
 * @returns {{prompt: Array<{role: string, content: string}>, responseLength: number, mode: 'home'|'place', bilingual: boolean, jsonSchema: object|null, entryCount: number}}
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
    const allParts = promptsFor(splitId, settings.picks?.[splitId], customLabels(settings, splitId));
    const unit = mode === 'place' ? 'zone' : 'room';
    const cover = coverList(settings.cover);

    // The slice of the place this request is responsible for. Absent, the
    // request covers everything, which is what a single-entry brief wants and
    // what every caller predating the split still asks for.
    const chunk = options.chunk || null;
    const parts = chunk ? chunk.rooms : allParts;
    const wantsWhole = !chunk || chunk.whole;
    const isSlice = !!chunk && chunk.total > 1;

    // A must-cover list competes with the word budget, and the budget wins:
    // told to fit ten subjects into 180 words, a model writes a sentence each
    // and calls it done, which is the omission again wearing a different hat.
    // Only the single-entry layout needs this — per-room entries already get
    // the full allowance apiece.
    const words = targetWords(settings)
        + (cover.length && !(perRoom && allParts.length)
            ? Math.min(cover.length * COVER_WORDS, COVER_WORDS_MAX)
            : 0);

    const whole = mode === 'place' ? 'building' : 'home';
    const entryPlan = perRoom && parts.length
        ? [
            `Write one entry per listed ${unit}: ${parts.join(', ')}.`,
            wantsWhole
                ? `Add one short entry titled for the ${whole} as a whole that covers the structure, the approach and the overall impression.`
                : '',
            isSlice
                ? `This request covers part of the ${whole} only — batch ${chunk.index + 1} of ${chunk.total}.`
                + ` Write entries for the ${unit}s listed above and for nothing else; the rest are being written separately.`
                : '',
        ].filter(Boolean).join(' ')
        : `Write a single entry covering the whole ${whole}. If the place has clearly distinct areas, give each its own paragraph inside that one entry.`;

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
        `Produce at most ${expectedEntries(parts.length, wantsWhole, perRoom, cover.length)} entries.`
        + ` Between ${counts.min} and ${counts.max} keywords each.`,
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
        userParts.push(`Include "${placeName}" as a keyword in every entry.`);
    }

    if (brief) userParts.push(`BRIEF\n${brief}`);
    if (context) userParts.push(context);

    const instruction = clean(settings.instruction);
    if (instruction) userParts.push(`ADDITIONAL INSTRUCTION\n${instruction}`);

    if (options.repair) {
        userParts.push(
            `Your previous reply was rejected: ${options.repair}\n`
            + 'Reply again with the JSON object only. No fences, no commentary, no explanation, '
            + 'all strings properly escaped and every brace closed. '
            + `Every entry needs its "keys" array filled in, ${counts.min} keywords at the very least, `
            + 'written before "content" so it cannot be the part that gets cut short. '
            + 'Keep it short if you must — a complete short answer beats a truncated long one.',
        );
    }

    const entryCount = expectedEntries(parts.length, wantsWhole, perRoom, cover.length);

    return {
        prompt: [
            { role: 'system', content: system },
            { role: 'user', content: userParts.join('\n\n') },
        ],
        responseLength: options.budget || replyBudget(words, counts.max, entryCount),
        mode,
        bilingual,
        jsonSchema: options.noSchema ? null : entriesSchema(),
        entryCount,
    };
}

/**
 * How many entries this request should produce.
 *
 * A must-cover item that matches no listed room is allowed an entry of its
 * own, so the number is a ceiling rather than a count.
 */
function expectedEntries(roomCount, wantsWhole, perRoom, coverCount) {
    if (!perRoom || !roomCount) return 1;
    return Math.min(roomCount + (wantsWhole ? 1 : 0) + coverCount, MAX_ENTRIES);
}

/**
 * The reply ceiling, in tokens.
 *
 * Two failures are being guarded against and they pull in the same direction.
 * A reply cut off mid-JSON loses everything after the cut, and a reasoning
 * model that spends its whole allowance thinking is refused outright by the
 * provider — "the output token limit was exhausted by model reasoning" — with
 * no reply at all. Both are answered by asking for more room than the answer
 * needs, which costs nothing when it goes unused.
 *
 * @param {number} words prose budget per entry
 * @param {number} maxKeys keywords allowed per entry
 * @param {number} entries how many entries this request asks for
 * @returns {number}
 */
export function replyBudget(words, maxKeys, entries) {
    const proseTokens = Math.ceil(words * 2.6);
    const perEntry = proseTokens + maxKeys * TOKENS_PER_KEY + TOKENS_PER_ENTRY_OVERHEAD;
    const answer = perEntry * Math.max(1, entries) + 512;
    return Math.min(RESPONSE_MAX, Math.max(RESPONSE_MIN, answer + REASONING_HEADROOM));
}

/**
 * Pull a JSON object out of a model reply.
 *
 * A structured-output request hands back a parsed object already, and the
 * rest arrives as text that may be wrapped in fences, prefaced with chatter,
 * preceded by a whole paragraph of visible reasoning, or cut off mid-string.
 * Every one of those is recovered from here rather than costing a request.
 *
 * @param {string|object} text
 * @returns {{ok: true, value: object} | {ok: false, error: string}}
 */
export function extractJson(text) {
    // A schema-constrained reply is already an object. Nothing to salvage and
    // nothing to guess at: this is the path that is supposed to be boring.
    if (text && typeof text === 'object' && !Array.isArray(text)) {
        return { ok: true, value: text };
    }

    let source = String(text ?? '').trim();
    if (!source) return { ok: false, error: 'empty reply' };

    // Visible chain-of-thought, in the several shapes it arrives in. Left in
    // place it puts braces and quotes in front of the answer, and everything
    // downstream then tries to parse the thinking instead of the reply.
    source = source
        .replace(/<(think|thinking|reasoning|thought)>[\s\S]*?<\/\1>/gi, '')
        .replace(/^[\s\S]*?<\/(?:think|thinking|reasoning|thought)>/i, '')
        .trim();

    // Fenced blocks anywhere in the reply, not only wrapping the whole of it:
    // "Here is the JSON:\n```json\n{...}\n```\nHope that helps" is the single
    // most common way a chatty model returns a perfectly good object.
    const candidates = [];
    for (const match of source.matchAll(/```[a-z]*\s*([\s\S]*?)```/gi)) {
        const body = match[1].trim();
        if (body) candidates.push(body);
    }
    candidates.push(source.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim());

    let lastError = 'no JSON object in the reply';

    for (const candidate of candidates) {
        const start = candidate.indexOf('{');
        if (start < 0) continue;
        const body = candidate.slice(start);

        const direct = tryParse(body);
        if (direct.ok) return direct;
        lastError = direct.error;

        const balanced = balance(body);
        if (balanced !== body) {
            const repaired = tryParse(balanced);
            if (repaired.ok) return repaired;
        }

        // Trailing commas are the single most common malformation, and an
        // unterminated final string the second: a reply that stopped mid-word
        // is closed off here so the entries before it survive.
        const patched = balance(closeString(body).replace(/,(\s*[}\]])/g, '$1'));
        const retry = tryParse(patched);
        if (retry.ok) return retry;
    }

    return { ok: false, error: lastError };
}

/**
 * Close a string left open by a reply that ran out of tokens mid-sentence.
 * `balance` can only cut back to the last complete entry once the quote is
 * shut; until then every brace after it looks like part of the text.
 */
function closeString(source) {
    let inString = false;
    let escaped = false;

    for (const character of source) {
        if (inString) {
            if (escaped) escaped = false;
            else if (character === '\\') escaped = true;
            else if (character === '"') inString = false;
            continue;
        }
        if (character === '"') inString = true;
    }

    if (!inString) return source;
    // A trailing backslash would escape the quote being added.
    return `${source.replace(/\\+$/, '')}"`;
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
 * Close off a reply that ran out of tokens, so the entries it did finish
 * still arrive.
 *
 * The brackets still open at the end of the text are tracked on a stack and
 * shut in reverse, which is the whole trick. An earlier version cut back to
 * the last complete entry object first and gave up when there wasn't one —
 * so a reply truncated inside its *first* entry was thrown away entirely,
 * which is exactly the case a small batch produces. Now the half-written
 * entry is closed where it stands; it may end mid-sentence, and the user is
 * about to read it in the review step anyway.
 *
 * A trailing comma or a dangling `"key":` left by the cut would still be a
 * syntax error, so both are trimmed before the brackets go on.
 */
function balance(source) {
    const stack = [];
    let inString = false;
    let escaped = false;
    let end = source.length;

    for (let index = 0; index < source.length; index++) {
        const character = source[index];

        if (inString) {
            if (escaped) escaped = false;
            else if (character === '\\') escaped = true;
            else if (character === '"') inString = false;
            continue;
        }

        if (character === '"') inString = true;
        else if (character === '{' || character === '[') stack.push(character);
        else if (character === '}' || character === ']') {
            stack.pop();
            // The outermost object closed: anything after it is commentary.
            if (!stack.length) {
                end = index + 1;
                break;
            }
        }
    }

    if (!inString && !stack.length) return source.slice(0, end);

    let truncated = source.slice(0, end);
    // An unterminated string has to be shut before the brackets, or the
    // closers would be swallowed as more text.
    if (inString) truncated = `${truncated.replace(/\\+$/, '')}"`;

    // A cut lands anywhere: after a comma, after a key and its colon, or in
    // the whitespace between. All three are syntax errors on their own.
    truncated = truncated
        .replace(/\s*$/, '')
        .replace(/,\s*$/, '')
        .replace(/,?\s*"[^"]*"\s*:\s*$/, '');

    for (let index = stack.length - 1; index >= 0; index--) {
        truncated += stack[index] === '{' ? '}' : ']';
    }
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
    const list = entryList(value);
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

/**
 * Find the array of entries in whatever the model wrapped it in.
 *
 * The schema asks for `{ "entries": [...] }` and that is what constrained
 * backends return. The unconstrained ones return a bare array, or `rooms`, or
 * `lorebook`, or one entry as a naked object — all of which are the answer,
 * and none of which is worth a second request to correct.
 *
 * @param {any} value
 * @returns {object[]|null}
 */
function entryList(value) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return null;

    for (const key of ['entries', 'rooms', 'zones', 'items', 'lorebook', 'results']) {
        if (Array.isArray(value[key])) return value[key];
    }

    // A single entry returned unwrapped. It has the fields of one, so it is
    // one, and refusing it over its packaging helps nobody.
    if (value.content || value.title) return [value];

    // One unrecognised key holding the array is still unambiguous.
    const arrays = Object.values(value).filter(Array.isArray);
    if (arrays.length === 1) return arrays[0];

    return null;
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
 * Read one keyword string in the compact form the prompt asks for.
 *
 *   kitchen            → stem
 *   =hall              → exact word
 *   couch|sofa|settee  → group of synonyms
 *   The Drowned Crow   → proper noun, spaces and all
 *
 * The prefix is the whole grammar. Asking for an object per keyword was three
 * times the tokens and the field models most often malformed; a bare string
 * is something even a small model gets right, and everything the objects
 * could express is still reachable from here.
 *
 * @param {string} text
 * @returns {object|null}
 */
function parseKeyString(text) {
    let value = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!value) return null;

    // Models like to wrap or annotate: "stem: кухн", "/kitchen/i", "**hall**".
    value = value
        .replace(/^(?:stem|exact|group|suffix|proper)\s*:\s*/i, match => (/exact/i.test(match) ? '=' : ''))
        .replace(/^\/(.+)\/[a-z]*$/i, '$1')
        .replace(/^\*+|\*+$/g, '')
        .trim();
    if (!value) return null;

    let mode = 'stem';
    if (value.startsWith('=')) {
        mode = 'exact';
        value = value.slice(1).trim();
    }
    if (!value) return null;

    if (value.includes('|')) {
        const values = value.split('|').map(part => part.trim()).filter(Boolean);
        if (!values.length) return null;
        // A synonym written with spaces cannot be a pattern member; it is a
        // proper noun that wandered into the list, so it is kept as one.
        if (values.some(part => /\s/.test(part))) {
            return { mode: 'proper', value: values[0] };
        }
        return values.length > 1 ? { mode: 'group', values } : { mode, value: values[0] };
    }

    if (/\s/.test(value)) return { mode: 'proper', value };
    return { mode, value };
}

/**
 * Coerce whatever the model called a key into the spec shape keys.js expects.
 *
 * Strings are the documented form now; the object shape is still read because
 * a model that saw the older contract, or simply likes objects, returns one,
 * and a reply is not worth rejecting over the packaging of its keywords.
 *
 * The cap is applied last, after rejects are dropped. Slicing first meant a
 * model that led with Russian in English-only mode spent the whole allowance
 * on specs that were then discarded, leaving the entry with no keys at all.
 */
function normalizeKeySpecs(raw, englishOnly) {
    const list = Array.isArray(raw)
        ? raw
        // "kitchen, кухн, =hall" — one string where an array was asked for.
        : typeof raw === 'string' ? raw.split(/[,\n]/) : [];
    const specs = [];

    for (const item of list) {
        if (specs.length >= MAX_KEYS_PER_ENTRY) break;

        if (typeof item === 'string') {
            const spec = parseKeyString(item);
            if (spec && !isRejectedScript(spec, englishOnly)) specs.push(spec);
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
