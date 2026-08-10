/**
 * Estate — settings storage.
 *
 * Two stores, because the things kept here answer two different questions.
 *
 * `extensionSettings` holds preferences: which model, how long an entry runs,
 * which script the keys use. Those are about how the user likes to work and
 * belong to the user, so they are global.
 *
 * `chatMetadata` holds the brief: the tags, the free text, the must-cover
 * list, whose home it is, which lorebook it lands in. Those are about one
 * particular place in one particular story, and keeping them global meant
 * every chat opened showing the last chat's answers.
 *
 * Everything read out of either store is rebuilt through an allowlist, so a
 * hand-edited or half-migrated file can never hand a malformed value to the
 * prompt builder or the lorebook writer.
 */

import { MODES, SECTIONS, chipIds, customId, isCustomId } from './catalog.js';

const MODULE_NAME = 'ST-Estate';

/** Where the per-chat brief lives inside `chatMetadata`. */
const BRIEF_KEY = 'estate_brief_v1';

export const TARGETS = Object.freeze(['character', 'persona', 'shared']);
export const BINDINGS = Object.freeze(['chat', 'character', 'persona', 'none']);

/**
 * Which scripts keywords are generated in. Entry text is always English;
 * only the matching side is a choice, because that is what decides whether a
 * Russian chat can trigger the entry at all.
 */
export const KEY_LANGUAGES = Object.freeze(['both', 'en']);
/**
 * Detail levels. `custom` carries its own number in `detailWords` instead of
 * reading one from the table: the three presets cover the usual cases and
 * nothing between or beyond them, which is a strange thing to withhold when
 * the value is a plain word count.
 */
export const DETAILS = Object.freeze(['brief', 'normal', 'rich', 'custom']);
export const GRANULARITY = Object.freeze(['single', 'rooms']);

/**
 * How the tag sections start out. A board is nine to eleven sections and
 * several hundred chips, so `filled` is the default: a section opens only if
 * something in it is already picked, which after the first run means the
 * board opens showing exactly the choices that were made.
 */
export const SECTION_STATE = Object.freeze(['collapsed', 'filled', 'expanded']);

/** Approximate word budget per entry, by detail level. */
export const DETAIL_WORDS = Object.freeze({ brief: 90, normal: 180, rich: 320 });

/**
 * Bounds on a hand-typed word count. The floor is where an entry stops being
 * a description; the ceiling is where one lorebook entry starts costing more
 * context every time it fires than the detail is worth.
 */
export const DETAIL_WORD_LIMITS = Object.freeze({ min: 40, max: 900 });

export const HISTORY_LIMITS = Object.freeze({ min: 0, max: 200 });

/**
 * How many buildings the scout may propose in one pass. Every one the user
 * ticks becomes a request of its own, so the ceiling is a bill as much as a
 * list length. Kept here with the other bounds rather than beside the scout:
 * settings.js is what sanitises the number, and importing it back out of
 * suggest.js would only be a cycle.
 */
export const SUGGEST_LIMITS = Object.freeze({ min: 3, max: 12 });

/**
 * How many entries one request may carry when a place is split by room.
 *
 * Asking for eleven rooms in one reply is thousands of tokens of JSON, and a
 * single unescaped quote or one token short of the closing brace costs the
 * whole batch. Smaller batches are more requests and more waiting, and they
 * arrive; the bound is here so the impatient can still ask for one big one.
 */
export const BATCH_LIMITS = Object.freeze({ min: 1, max: 12 });
export const NAME_MAX = 60;
const INSTRUCTION_MAX = 4000;
const EXTRA_MAX = 2000;
const PROFILE_ID_MAX = 200;

/**
 * The must-cover list: things the description is not allowed to skip. Stored
 * as the raw text the user typed and split on demand, so editing it back and
 * forth never loses an item to the parser.
 */
export const COVER_MAX = 600;
export const COVER_ITEMS_MAX = 16;
const COVER_ITEM_MAX = 60;

/** Caps on user-defined tags, so a runaway paste cannot bloat the settings file. */
export const CUSTOM_TAG_MAX = 60;
const CUSTOM_TAGS_PER_SECTION = 24;

const DEFAULT_NAME_TEMPLATE = 'Estate - {char}';
const DEFAULT_INSTRUCTION = '';

/**
 * Global preferences. How the user likes to work, not what they are building.
 * `customTags` sits here deliberately: a tag someone invented is part of their
 * vocabulary, and having to retype it in every chat would be the same
 * complaint from the other direction.
 */
const DEFAULTS = Object.freeze({
    nameTemplate: DEFAULT_NAME_TEMPLATE,
    bind: 'chat',
    keyLanguage: 'both',
    detail: 'normal',
    detailWords: DETAIL_WORDS.normal,
    granularity: 'single',
    sectionState: 'filled',
    profileId: '',
    useCard: true,
    usePersona: true,
    useLore: true,
    useHistory: false,
    historyCount: 20,
    suggestCount: 6,
    entriesPerRequest: 3,
    instruction: DEFAULT_INSTRUCTION,
    customTags: {},
});

/** The per-chat brief. One place, one story — this is what used to leak. */
const BRIEF_DEFAULTS = Object.freeze({
    mode: 'home',
    target: 'character',
    picks: {},
    extra: '',
    cover: '',
    placeName: '',
    lorebookName: '',
    createNew: true,
});

let cached = null;

function plainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stripControlCharacters(value) {
    return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

function normalizeText(value, max, fallback = '') {
    if (typeof value !== 'string') return fallback;
    const clean = stripControlCharacters(value).slice(0, max);
    return clean.trim() ? clean : fallback;
}

/**
 * Coerce a value to an integer inside `[min, max]`, falling back when the
 * input is not a finite number at all.
 */
export function clampInt(value, { min, max }, fallback) {
    const number = typeof value === 'number' ? value : Number.parseInt(String(value ?? '').trim(), 10);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(number)));
}

function oneOf(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
}

/**
 * User-defined tags, stored per section as the text the user actually typed.
 * Case is preserved for display; `customId()` folds it for identity.
 */
function sanitizeCustomTags(value) {
    const raw = plainObject(value);
    const output = {};
    for (const section of SECTIONS) {
        const list = Array.isArray(raw[section.id]) ? raw[section.id] : [];
        const kept = [];
        const seen = new Set();
        for (const item of list) {
            if (typeof item !== 'string') continue;
            const text = stripControlCharacters(item).replace(/\s+/g, ' ').trim().slice(0, CUSTOM_TAG_MAX);
            if (!text) continue;
            const id = customId(text);
            if (seen.has(id)) continue;
            seen.add(id);
            kept.push(text);
            if (kept.length >= CUSTOM_TAGS_PER_SECTION) break;
        }
        if (kept.length) output[section.id] = kept;
    }
    return output;
}

/**
 * Drop unknown section ids and unknown chip ids, then honour each section cap.
 * A custom id survives only while its tag still exists in `customTags`.
 */
function sanitizePicks(value, customTags) {
    const raw = plainObject(value);
    const output = {};
    for (const section of SECTIONS) {
        const valid = new Set(chipIds(section.id));
        for (const text of customTags[section.id] || []) valid.add(customId(text));

        const chosen = Array.isArray(raw[section.id]) ? raw[section.id] : [];
        const unique = [];
        for (const id of chosen) {
            if (typeof id !== 'string' || !valid.has(id) || unique.includes(id)) continue;
            unique.push(id);
        }
        const cap = section.multi ? (section.max || unique.length) : 1;
        output[section.id] = unique.slice(0, cap);
    }
    return output;
}

/**
 * Text of every custom tag, keyed by id — what `promptsFor` and `labelsFor`
 * need to turn a stored id back into words.
 *
 * @param {object} settings
 * @param {string} sectionId
 * @returns {Record<string, string>}
 */
export function customLabels(settings, sectionId) {
    const labels = {};
    for (const text of settings?.customTags?.[sectionId] || []) labels[customId(text)] = text;
    return labels;
}

/**
 * Add a user-defined tag to a section and select it.
 *
 * @param {object} settings
 * @param {string} sectionId
 * @param {string} text
 * @returns {{ok: true, id: string, text: string, existed: boolean} | {ok: false, reason: 'empty'|'full'}}
 */
export function addCustomTag(settings, sectionId, text) {
    const clean = stripControlCharacters(String(text ?? '')).replace(/\s+/g, ' ').trim().slice(0, CUSTOM_TAG_MAX);
    if (!clean) return { ok: false, reason: 'empty' };

    if (!settings.customTags[sectionId]) settings.customTags[sectionId] = [];
    const list = settings.customTags[sectionId];
    const id = customId(clean);

    const existing = list.find(item => customId(item) === id);
    if (existing) return { ok: true, id, text: existing, existed: true };

    if (list.length >= CUSTOM_TAGS_PER_SECTION) return { ok: false, reason: 'full' };
    list.push(clean);
    return { ok: true, id, text: clean, existed: false };
}

/**
 * Forget a user-defined tag.
 *
 * Only the vocabulary is touched here. The pick that referred to the tag is
 * dropped by the caller, which holds the brief: a tag deleted in one chat
 * must not silently rewrite the picks of every other one. Briefs elsewhere
 * shed the dead id on their next read, in `sanitizePicks`.
 *
 * @param {object} settings
 * @param {string} sectionId
 * @param {string} id
 */
export function removeCustomTag(settings, sectionId, id) {
    const list = settings.customTags[sectionId];
    if (!Array.isArray(list)) return;
    settings.customTags[sectionId] = list.filter(item => customId(item) !== id);
    if (!settings.customTags[sectionId].length) delete settings.customTags[sectionId];
}

/** @returns {boolean} whether the section has room for another custom tag. */
export function customTagsFull(settings, sectionId) {
    return (settings?.customTags?.[sectionId]?.length || 0) >= CUSTOM_TAGS_PER_SECTION;
}

export { isCustomId };

function normalizeProfileId(value) {
    if (typeof value !== 'string') return '';
    return stripControlCharacters(value).trim().slice(0, PROFILE_ID_MAX);
}

/**
 * The live settings object. Mutate it in place, then call `saveSettings()`.
 * @returns {object}
 */
export function getSettings() {
    const ctx = SillyTavern.getContext();
    const current = ctx.extensionSettings[MODULE_NAME];
    if (cached && current === cached) return cached;

    const raw = plainObject(current);
    const customTags = sanitizeCustomTags(raw.customTags);
    cached = {
        customTags,
        nameTemplate: normalizeText(raw.nameTemplate, NAME_MAX * 2, DEFAULT_NAME_TEMPLATE),
        bind: oneOf(raw.bind, BINDINGS, DEFAULTS.bind),
        keyLanguage: oneOf(raw.keyLanguage, KEY_LANGUAGES, DEFAULTS.keyLanguage),
        detail: oneOf(raw.detail, DETAILS, DEFAULTS.detail),
        detailWords: clampInt(raw.detailWords, DETAIL_WORD_LIMITS, DEFAULTS.detailWords),
        granularity: oneOf(raw.granularity, GRANULARITY, DEFAULTS.granularity),
        sectionState: oneOf(raw.sectionState, SECTION_STATE, DEFAULTS.sectionState),
        profileId: normalizeProfileId(raw.profileId),
        useCard: typeof raw.useCard === 'boolean' ? raw.useCard : DEFAULTS.useCard,
        usePersona: typeof raw.usePersona === 'boolean' ? raw.usePersona : DEFAULTS.usePersona,
        useLore: typeof raw.useLore === 'boolean' ? raw.useLore : DEFAULTS.useLore,
        useHistory: typeof raw.useHistory === 'boolean' ? raw.useHistory : DEFAULTS.useHistory,
        historyCount: clampInt(raw.historyCount, HISTORY_LIMITS, DEFAULTS.historyCount),
        suggestCount: clampInt(raw.suggestCount, SUGGEST_LIMITS, DEFAULTS.suggestCount),
        entriesPerRequest: clampInt(raw.entriesPerRequest, BATCH_LIMITS, DEFAULTS.entriesPerRequest),
        instruction: normalizeText(raw.instruction, INSTRUCTION_MAX, DEFAULT_INSTRUCTION),
    };

    ctx.extensionSettings[MODULE_NAME] = cached;
    return cached;
}

export function saveSettings() {
    SillyTavern.getContext().saveSettingsDebounced();
}

// ---------------------------------------------------------------------------
// The per-chat brief
// ---------------------------------------------------------------------------

/** @returns {object|null} `chatMetadata`, or null when no chat is open. */
function chatMeta() {
    try {
        const ctx = SillyTavern.getContext();
        return ctx.chatMetadata || ctx.chat_metadata || null;
    } catch {
        return null;
    }
}

/** @returns {boolean} whether a chat is open and a brief can be persisted. */
export function hasChat() {
    return !!chatMeta();
}

/**
 * Rebuild a stored brief through the allowlist. Custom tags come from the
 * global store, because that is where the user's own vocabulary lives — a
 * pick referring to one is only valid while the tag itself still exists.
 *
 * @param {object} raw
 * @param {object} customTags
 * @returns {object}
 */
function sanitizeBrief(raw, customTags) {
    const value = plainObject(raw);
    return {
        mode: oneOf(value.mode, MODES, BRIEF_DEFAULTS.mode),
        target: oneOf(value.target, TARGETS, BRIEF_DEFAULTS.target),
        picks: sanitizePicks(value.picks, customTags),
        extra: normalizeText(value.extra, EXTRA_MAX, BRIEF_DEFAULTS.extra),
        cover: normalizeText(value.cover, COVER_MAX, BRIEF_DEFAULTS.cover),
        placeName: normalizeText(value.placeName, NAME_MAX * 2, BRIEF_DEFAULTS.placeName),
        lorebookName: normalizeText(value.lorebookName, NAME_MAX * 2, BRIEF_DEFAULTS.lorebookName),
        createNew: typeof value.createNew === 'boolean' ? value.createNew : BRIEF_DEFAULTS.createNew,
    };
}

/**
 * The brief for the open chat. Mutate it in place, then call `saveBrief()`.
 *
 * With no chat open the caller still gets a usable object; it simply is not
 * persisted. Dropping those writes is deliberate — the alternative is holding
 * them until a chat opens and then stamping that chat with answers meant for
 * nothing in particular, which is the bug this whole split exists to fix.
 *
 * @returns {object}
 */
export function getBrief() {
    const settings = getSettings();
    const meta = chatMeta();
    if (!meta) return sanitizeBrief({}, settings.customTags);

    // Rebuilt in place: the object handed back is the one stored on the chat,
    // so a UI holding a reference keeps writing somewhere that gets saved.
    const clean = sanitizeBrief(meta[BRIEF_KEY], settings.customTags);
    meta[BRIEF_KEY] = clean;
    return clean;
}

/** Persist the brief. ST debounces the underlying file write. */
export function saveBrief() {
    try {
        const ctx = SillyTavern.getContext();
        if (typeof ctx.saveMetadataDebounced === 'function') ctx.saveMetadataDebounced();
        else if (typeof ctx.saveMetadata === 'function') ctx.saveMetadata();
    } catch (error) {
        console.warn('[Estate] saveMetadata failed', error);
    }
}

export function defaultNameTemplate() {
    return DEFAULT_NAME_TEMPLATE;
}

export function defaultSectionState() {
    return DEFAULTS.sectionState;
}

/**
 * Whether a section should open folded. The preference is global, the picks
 * it is measured against belong to the chat.
 *
 * @param {object} settings
 * @param {object} brief
 * @param {string} sectionId
 * @returns {boolean}
 */
export function startsCollapsed(settings, brief, sectionId) {
    const state = settings?.sectionState;
    if (state === 'expanded') return false;
    if (state === 'collapsed') return true;
    return !(brief?.picks?.[sectionId] || []).length;
}

/**
 * Split the must-cover field into individual items.
 *
 * Commas, semicolons and newlines all separate, because people type all
 * three and none of them is wrong. The raw text is what gets stored, so a
 * half-typed list survives a reopen intact.
 *
 * @param {string} value
 * @returns {string[]}
 */
export function coverList(value) {
    if (typeof value !== 'string') return [];
    const items = [];
    for (const piece of stripControlCharacters(value).split(/[,;\n\r]+/)) {
        const text = piece.replace(/\s+/g, ' ').trim().slice(0, COVER_ITEM_MAX);
        if (!text || items.some(item => item.toLowerCase() === text.toLowerCase())) continue;
        items.push(text);
        if (items.length >= COVER_ITEMS_MAX) break;
    }
    return items;
}

/** @returns {number} the word budget the current detail level asks for. */
export function targetWords(settings) {
    if (settings?.detail === 'custom') {
        return clampInt(settings.detailWords, DETAIL_WORD_LIMITS, DETAIL_WORDS.normal);
    }
    return DETAIL_WORDS[settings?.detail] || DETAIL_WORDS.normal;
}

/**
 * Connection profiles the request service can actually drive.
 * @returns {object[]}
 */
export function supportedProfiles() {
    try {
        return SillyTavern.getContext().ConnectionManagerRequestService?.getSupportedProfiles?.() || [];
    } catch (error) {
        console.warn('[Estate] connection profiles', error);
        return [];
    }
}

/**
 * Resolve the stored profile id to one that still exists and is usable.
 * Returns an empty string to mean "use the current connection".
 *
 * @param {object} settings
 * @returns {string}
 */
export function resolveProfileId(settings) {
    const id = normalizeProfileId(settings?.profileId);
    if (!id) return '';
    try {
        const ctx = SillyTavern.getContext();
        if (ctx.extensionSettings?.disabledExtensions?.includes('connection-manager')) return '';
        const exists = ctx.extensionSettings?.connectionManager?.profiles?.some(profile => profile?.id === id);
        return exists ? id : '';
    } catch {
        return '';
    }
}
