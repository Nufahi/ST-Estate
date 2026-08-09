/**
 * Estate — settings storage.
 *
 * Everything read out of `extensionSettings` is rebuilt through an allowlist,
 * so a hand-edited or half-migrated settings file can never hand a malformed
 * value to the prompt builder or the lorebook writer.
 */

import { SECTIONS, chipIds } from './catalog.js';

const MODULE_NAME = 'ST-Estate';

export const TARGETS = Object.freeze(['character', 'persona', 'shared']);
export const BINDINGS = Object.freeze(['chat', 'character', 'persona', 'none']);
export const LANGUAGES = Object.freeze(['auto', 'en', 'ru']);
export const DETAILS = Object.freeze(['brief', 'normal', 'rich']);
export const GRANULARITY = Object.freeze(['single', 'rooms']);

/** Approximate word budget per entry, by detail level. */
export const DETAIL_WORDS = Object.freeze({ brief: 90, normal: 180, rich: 320 });

export const HISTORY_LIMITS = Object.freeze({ min: 0, max: 200 });
export const NAME_MAX = 60;
const INSTRUCTION_MAX = 4000;
const EXTRA_MAX = 2000;
const PROFILE_ID_MAX = 200;

const DEFAULT_NAME_TEMPLATE = 'Estate - {char}';
const DEFAULT_INSTRUCTION = '';

const DEFAULTS = Object.freeze({
    target: 'character',
    picks: {},
    extra: '',
    lorebookName: '',
    createNew: true,
    nameTemplate: DEFAULT_NAME_TEMPLATE,
    bind: 'chat',
    language: 'auto',
    detail: 'normal',
    granularity: 'single',
    profileId: '',
    useCard: true,
    usePersona: true,
    useHistory: false,
    historyCount: 20,
    instruction: DEFAULT_INSTRUCTION,
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

/** Drop unknown section ids and unknown chip ids, then honour each section cap. */
function sanitizePicks(value) {
    const raw = plainObject(value);
    const output = {};
    for (const section of SECTIONS) {
        const valid = new Set(chipIds(section.id));
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
    cached = {
        target: oneOf(raw.target, TARGETS, DEFAULTS.target),
        picks: sanitizePicks(raw.picks),
        extra: normalizeText(raw.extra, EXTRA_MAX, DEFAULTS.extra),
        lorebookName: normalizeText(raw.lorebookName, NAME_MAX * 2, DEFAULTS.lorebookName),
        createNew: typeof raw.createNew === 'boolean' ? raw.createNew : DEFAULTS.createNew,
        nameTemplate: normalizeText(raw.nameTemplate, NAME_MAX * 2, DEFAULT_NAME_TEMPLATE),
        bind: oneOf(raw.bind, BINDINGS, DEFAULTS.bind),
        language: oneOf(raw.language, LANGUAGES, DEFAULTS.language),
        detail: oneOf(raw.detail, DETAILS, DEFAULTS.detail),
        granularity: oneOf(raw.granularity, GRANULARITY, DEFAULTS.granularity),
        profileId: normalizeProfileId(raw.profileId),
        useCard: typeof raw.useCard === 'boolean' ? raw.useCard : DEFAULTS.useCard,
        usePersona: typeof raw.usePersona === 'boolean' ? raw.usePersona : DEFAULTS.usePersona,
        useHistory: typeof raw.useHistory === 'boolean' ? raw.useHistory : DEFAULTS.useHistory,
        historyCount: clampInt(raw.historyCount, HISTORY_LIMITS, DEFAULTS.historyCount),
        instruction: normalizeText(raw.instruction, INSTRUCTION_MAX, DEFAULT_INSTRUCTION),
    };

    ctx.extensionSettings[MODULE_NAME] = cached;
    return cached;
}

export function saveSettings() {
    SillyTavern.getContext().saveSettingsDebounced();
}

export function defaultNameTemplate() {
    return DEFAULT_NAME_TEMPLATE;
}

/** @returns {number} the word budget the current detail level asks for. */
export function targetWords(settings) {
    return DETAIL_WORDS[settings.detail] || DETAIL_WORDS.normal;
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
