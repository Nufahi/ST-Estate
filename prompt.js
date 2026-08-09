/**
 * Estate — prompt assembly and reply parsing.
 *
 * The model is asked for JSON and nothing else, and is explicitly told not to
 * write regular expressions: it declares keyword stems with a mode, and
 * keys.js compiles those into patterns that are correct by construction.
 */

import { SPLIT_SECTION, sectionsFor } from './catalog.js';
import { promptsFor } from './catalog.js';
import { customLabels, targetWords } from './settings.js';

const MAX_ENTRIES = 12;
const MAX_KEYS_PER_ENTRY = 16;

/** Reply contract handed to the model verbatim. */
const SCHEMA = `{
  "entries": [
    {
      "title": "short entry title, 2-5 words",
      "room": "which room, zone or aspect this entry covers, or \\"whole\\" for the entire place",
      "content": "the description itself",
      "visual": "comma-separated visual tags: materials, colours, light, notable objects",
      "keys": [
        { "mode": "stem",   "lang": "en", "value": "kitchen" },
        { "mode": "exact",  "lang": "en", "value": "hall" },
        { "mode": "group",  "lang": "en", "values": ["couch", "sofa", "settee"] },
        { "mode": "suffix", "lang": "en", "value": "cook", "suffixes": ["s", "ed", "ing"] },
        { "mode": "proper", "value": "Crimson Bar" }
      ]
    }
  ]
}`;

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

ENGLISH ONLY. Every keyword value is written in English, always, whatever
language the description itself uses. Set "lang" to "en" on all of them.
Proper nouns are the one exception — a name stays in whatever script it is
written in. Do not supply Russian keywords: they will be discarded.`;

function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
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

/** Resolve `auto` into the language the chat is actually written in. */
function resolveLanguage(ctx, settings) {
    if (settings.language === 'ru' || settings.language === 'en') return settings.language;
    const sample = (ctx.chat || [])
        .filter(message => message && !message.is_system && typeof message.mes === 'string')
        .slice(-6)
        .map(message => message.mes)
        .join(' ');
    if (/[А-Яа-яЁё]/.test(sample)) return 'ru';
    const description = clean(ctx.getCharacterCardFields?.()?.description || '');
    return /[А-Яа-яЁё]/.test(description) ? 'ru' : 'en';
}

/** Only the context the user asked for, trimmed to something sane. */
function buildContext(ctx, settings) {
    const parts = [];
    const fields = ctx.getCharacterCardFields?.() || {};

    if (settings.useCard && fields.description) {
        parts.push(`CHARACTER CARD\n${clean(fields.description).slice(0, 4000)}`);
    }
    if (settings.usePersona && fields.persona) {
        parts.push(`PERSONA\n${clean(fields.persona).slice(0, 2000)}`);
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
 * @param {{repair?: string}} [options] `repair` carries the parser error back
 *        to the model on the retry pass.
 * @returns {{prompt: Array<{role: string, content: string}>, responseLength: number, mode: 'home'|'place', language: 'en'|'ru'}}
 */
export function buildRequest(settings, options = {}) {
    const ctx = SillyTavern.getContext();
    const mode = settings.mode === 'place' ? 'place' : 'home';
    const language = resolveLanguage(ctx, settings);
    const words = targetWords(settings);
    const occupancy = buildOccupancy(ctx, settings, mode);
    const brief = buildBrief(settings, mode);
    const context = buildContext(ctx, settings);

    const splitId = SPLIT_SECTION[mode];
    const perRoom = settings.granularity === 'rooms';
    const parts = promptsFor(splitId, settings.picks?.[splitId], customLabels(settings, splitId));
    const unit = mode === 'place' ? 'zone' : 'room';

    const entryPlan = perRoom && parts.length
        ? `Write one entry per listed ${unit}: ${parts.join(', ')}. Add one short entry titled for the ${mode === 'place' ? 'building' : 'home'} as a whole that covers the structure, the approach and the overall impression.`
        : `Write a single entry covering the whole ${mode === 'place' ? 'building' : 'home'}. If the place has clearly distinct areas, give each its own paragraph inside that one entry.`;

    // Text follows the chat, keys never do: keyword matching is what the
    // compiler in keys.js is tuned for, and it is tuned for English.
    const languageRule = language === 'ru'
        ? 'Write "title" and "content" in Russian. "visual" stays in English — it feeds image generation. All keyword values are English regardless.'
        : 'Write "title", "content" and "visual" in English.';

    const subject = mode === 'place'
        ? 'You are a set designer writing reference material for a roleplay. You describe the buildings a story passes through.'
        : 'You are a set designer writing reference material for a roleplay. You describe where people live.';

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
        '',
        entryPlan,
        `Produce at most ${MAX_ENTRIES} entries. Between 4 and ${MAX_KEYS_PER_ENTRY} keywords each.`,
        languageRule,
        '',
        KEY_RULES,
        '',
        'OUTPUT',
        'Reply with a single JSON object and nothing else. No prose before or after, no markdown fences.',
        SCHEMA,
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
            `Your previous reply could not be parsed: ${options.repair}\n`
            + 'Reply again with the JSON object only. No fences, no commentary, all strings properly escaped.',
        );
    }

    const entryCount = perRoom && parts.length ? Math.min(parts.length + 1, MAX_ENTRIES) : 1;
    const responseLength = Math.min(16384, Math.max(1024, Math.ceil(words * entryCount * 2.6) + 512));

    return {
        prompt: [
            { role: 'system', content: system },
            { role: 'user', content: userParts.join('\n\n') },
        ],
        responseLength,
        mode,
        language,
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
 * Validate and normalise the parsed reply into draft entries.
 * Keyword compilation happens later, in the preview layer, so the user can
 * still edit the raw stems before they become patterns.
 *
 * @param {object} value
 * @returns {{ok: true, entries: object[]} | {ok: false, error: string}}
 */
export function normalizeEntries(value) {
    const list = Array.isArray(value?.entries) ? value.entries : Array.isArray(value) ? value : null;
    if (!list) return { ok: false, error: '"entries" is missing or not an array' };

    const entries = [];
    for (const raw of list.slice(0, MAX_ENTRIES)) {
        if (!raw || typeof raw !== 'object') continue;

        const content = String(raw.content ?? '').trim();
        if (!content) continue;

        const title = String(raw.title ?? '').trim().slice(0, 120)
            || String(raw.room ?? '').trim().slice(0, 120)
            || 'Home';

        entries.push({
            title,
            room: String(raw.room ?? '').trim().slice(0, 60),
            content,
            visual: String(raw.visual ?? '').trim().slice(0, 1200),
            keys: normalizeKeySpecs(raw.keys),
        });
    }

    if (!entries.length) return { ok: false, error: 'no usable entries' };
    return { ok: true, entries };
}

const CYRILLIC = /[А-Яа-яЁё]/;

/**
 * Keywords are English by contract. Models drift back to the chat language
 * anyway, so a Cyrillic value is dropped here rather than compiled into a
 * pattern nobody asked for. Proper nouns keep whatever script they came in.
 */
function isRejectedScript(spec) {
    if (spec.mode === 'proper') return false;
    const values = [spec.value, ...(spec.values || [])].filter(Boolean);
    return values.some(value => CYRILLIC.test(value));
}

/** Coerce whatever the model called a key into the spec shape keys.js expects. */
function normalizeKeySpecs(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const specs = [];

    for (const item of list.slice(0, MAX_KEYS_PER_ENTRY)) {
        if (typeof item === 'string') {
            const value = item.trim();
            if (!value) continue;
            const spec = { mode: /\s/.test(value) ? 'proper' : 'stem', value };
            if (!isRejectedScript(spec)) specs.push(spec);
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
        if (!isRejectedScript(spec)) specs.push(spec);
    }

    return specs;
}
