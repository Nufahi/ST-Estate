/**
 * Estate — keyword compiler.
 *
 * The model is never asked to write regular expressions: it stably breaks
 * lookbehinds, mixes `\b` into Cyrillic and leaves stray spaces inside
 * patterns. Instead it returns bare stems with a declared mode, and this
 * module compiles them into the delimited regex strings SillyTavern parses.
 *
 * Compiled shapes (STAR stands for an asterisk):
 *   cyrillic stem   /(?<![А-Яа-яЁё])кварти[А-Яа-яЁё]STAR/i
 *   cyrillic exact  /(?<![А-Яа-яЁё])дом(?![А-Яа-яЁё])/i
 *   cyrillic group  /(?<![А-Яа-яЁё])(?:кухн|кухон)[А-Яа-яЁё]STAR/i
 *   latin exact     /\bloft\b/i
 *   latin suffix    /\bkiss(?:es|ed|ing)?\b/i
 *   latin group     /\b(?:couch|sofa|settee)\b/i
 *   proper noun     Crimson Bar        (plain text, no regex)
 */

/** Character class used for every Cyrillic boundary assertion. */
export const CYR = 'А-Яа-яЁё';

const CYRILLIC_TEST = /[А-Яа-яЁё]/;
const LATIN_TEST = /[A-Za-z]/;
const REGEX_META = /[.*+?^${}()|[\]\\/]/g;

/** Latin words this short are too ambiguous to match without hard boundaries. */
const SHORT_WORD_LIMIT = 3;

export const MODES = Object.freeze(['stem', 'exact', 'suffix', 'group', 'proper']);

/** Lookbehind is unsupported on some older WebKit builds — degrade, never throw. */
export const SUPPORTS_LOOKBEHIND = (() => {
    try {
        new RegExp('(?<!x)y');
        return true;
    } catch {
        return false;
    }
})();

function escapeLiteral(value) {
    return String(value).replace(REGEX_META, '\\$&');
}

/** Collapse whitespace and strip anything that cannot belong in a keyword. */
function cleanValue(value) {
    return String(value ?? '')
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** @returns {'ru'|'en'} the script a value is written in. */
export function detectScript(value) {
    return CYRILLIC_TEST.test(String(value)) ? 'ru' : 'en';
}

function cyrillicPrefix() {
    return SUPPORTS_LOOKBEHIND ? `(?<![${CYR}])` : '';
}

function cyrillicSuffix() {
    return `(?![${CYR}])`;
}

/**
 * Compile one declared keyword into a SillyTavern keyword string.
 *
 * @param {{mode?: string, value?: string, values?: string[], suffixes?: string[], lang?: string}} spec
 * @returns {{ok: true, key: string, mode: string, lang: string} | {ok: false, reason: string, input: string}}
 */
export function compileKey(spec) {
    const raw = spec && typeof spec === 'object' ? spec : {};
    const mode = MODES.includes(raw.mode) ? raw.mode : 'exact';

    const values = Array.isArray(raw.values) && raw.values.length
        ? raw.values.map(cleanValue).filter(Boolean)
        : [cleanValue(raw.value)].filter(Boolean);

    if (!values.length) {
        return { ok: false, reason: 'empty', input: String(raw.value ?? '') };
    }

    const sample = values[0];
    const lang = raw.lang === 'ru' || raw.lang === 'en' ? raw.lang : detectScript(sample);

    // Proper nouns bypass regex entirely — plain text is both faster and safer.
    if (mode === 'proper') {
        const text = values.join(' ').trim();
        if (!text) return { ok: false, reason: 'empty', input: sample };
        return { ok: true, key: text, mode, lang };
    }

    // A multi-word value cannot live inside these patterns without a space,
    // and spaces inside the pattern are exactly what the rules forbid.
    const multiWord = values.some(value => /\s/.test(value));
    if (multiWord) {
        return { ok: false, reason: 'spaces', input: sample };
    }

    const mixedScript = values.some(value => detectScript(value) !== lang);
    if (mixedScript) {
        return { ok: false, reason: 'mixedScript', input: sample };
    }

    const alternation = values.length > 1 || mode === 'group';
    const body = alternation
        ? `(?:${values.map(escapeLiteral).join('|')})`
        : escapeLiteral(values[0]);

    let pattern;
    if (lang === 'ru') {
        // Stems and groups both continue into any word ending; exact does not.
        const tail = mode === 'exact' ? cyrillicSuffix() : `[${CYR}]*`;
        pattern = `${cyrillicPrefix()}${body}${tail}`;
    } else {
        if (!LATIN_TEST.test(sample)) {
            return { ok: false, reason: 'notLatin', input: sample };
        }
        const tooShort = values.some(value => value.length <= SHORT_WORD_LIMIT);
        if (tooShort && mode === 'stem') {
            // A bare Latin stem has no right boundary, so a 3-letter stem would
            // fire on half the dictionary. Force it back to an exact match.
            pattern = `\\b${body}\\b`;
        } else if (mode === 'stem') {
            pattern = `\\b${body}[A-Za-z]*\\b`;
        } else if (mode === 'suffix') {
            const suffixes = (Array.isArray(raw.suffixes) ? raw.suffixes : ['s'])
                .map(cleanValue)
                .filter(value => value && /^[A-Za-z']+$/.test(value));
            const group = suffixes.length
                ? `(?:${[...new Set(suffixes)].map(escapeLiteral).join('|')})?`
                : '';
            pattern = `\\b${body}${group}\\b`;
        } else {
            pattern = `\\b${body}\\b`;
        }
    }

    const key = `/${pattern}/i`;
    const check = validateKey(key);
    if (!check.ok) return { ok: false, reason: check.reason, input: sample };

    return { ok: true, key, mode, lang };
}

/**
 * Verify a delimited keyword string is something SillyTavern can actually run.
 * Plain text keys always pass; regex keys must compile and obey the rules.
 *
 * @param {string} key
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function validateKey(key) {
    const text = String(key ?? '').trim();
    if (!text) return { ok: false, reason: 'empty' };

    const match = /^\/(.+)\/([a-z]*)$/s.exec(text);
    if (!match) {
        // Plain text keyword. Only reject control characters and stray commas,
        // which would split the key when SillyTavern parses the field.
        if (text.includes(',')) return { ok: false, reason: 'comma' };
        return { ok: true };
    }

    const [, pattern, flags] = match;

    if (/\s/.test(pattern)) return { ok: false, reason: 'spaces' };
    if (!flags.includes('i')) return { ok: false, reason: 'noIgnoreCase' };

    // `\b` is computed from [A-Za-z0-9_], so it is meaningless next to Cyrillic
    // and silently matches in the wrong places.
    if (CYRILLIC_TEST.test(pattern) && /\\b/.test(pattern)) {
        return { ok: false, reason: 'cyrillicWordBoundary' };
    }

    try {
        new RegExp(pattern, flags);
    } catch {
        return { ok: false, reason: 'invalid' };
    }

    return { ok: true };
}

/**
 * Compile a whole list of declared keywords, dropping duplicates and rejects.
 *
 * @param {Array<object|string>} specs
 * @param {{limit?: number}} [options]
 * @returns {{keys: string[], rejected: Array<{input: string, reason: string}>}}
 */
export function compileKeys(specs, options = {}) {
    const limit = Number.isFinite(options.limit) ? Math.max(1, options.limit) : 24;
    const keys = [];
    const rejected = [];
    const seen = new Set();

    for (const spec of Array.isArray(specs) ? specs : []) {
        if (keys.length >= limit) break;

        // A bare string is treated as a proper noun — that is the only mode
        // where the author's literal text is what should reach the lorebook.
        const normalized = typeof spec === 'string' ? { mode: 'proper', value: spec } : spec;
        const result = compileKey(normalized);

        if (!result.ok) {
            rejected.push({ input: result.input, reason: result.reason });
            continue;
        }

        const fingerprint = result.key.toLowerCase();
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        keys.push(result.key);
    }

    return { keys, rejected };
}

/**
 * Explain a compiled key in plain language, for the preview dialog.
 * Returns a `{ text, kind }` pair so the caller can localise the kind.
 *
 * @param {string} key
 * @returns {{text: string, kind: 'plain'|'stem'|'exact'|'suffix'}}
 */
export function describeKey(key) {
    const text = String(key ?? '');
    const match = /^\/(.+)\/([a-z]*)$/s.exec(text);
    if (!match) return { text, kind: 'plain' };

    let pattern = match[1];
    const isStem = pattern.includes(`[${CYR}]*`) || pattern.includes('[A-Za-z]*');

    // Strip the boundary machinery so only the words themselves remain.
    pattern = pattern
        .replace(new RegExp(`\\(\\?<!\\[${CYR}\\]\\)`, 'g'), '')
        .replace(new RegExp(`\\(\\?!\\[${CYR}\\]\\)`, 'g'), '')
        .replace(new RegExp(`\\[${CYR}\\]\\*`, 'g'), '')
        .replace(/\[A-Za-z\]\*/g, '')
        .replace(/\\b/g, '');

    // A trailing optional group is the suffix list, not part of the stem.
    let suffixes = [];
    const suffixMatch = /\((?:\?:)?([^()]*)\)\?$/.exec(pattern);
    if (suffixMatch) {
        suffixes = suffixMatch[1].split('|').filter(Boolean);
        pattern = pattern.slice(0, suffixMatch.index);
    }

    const groupMatch = /^\((?:\?:)?([^()]*)\)$/.exec(pattern);
    const words = (groupMatch ? groupMatch[1] : pattern)
        .split('|')
        .map(word => word.replace(/\\(.)/g, '$1'))
        .filter(Boolean);

    const label = words.join(', ');
    if (suffixes.length) {
        return { text: `${label} (+${suffixes.join('/')})`, kind: 'suffix' };
    }
    return { text: label, kind: isStem ? 'stem' : 'exact' };
}
