/**
 * Estate — lorebook writing.
 *
 * Entries are always created through SillyTavern's own `createWorldInfoEntry`,
 * so the shape stays correct as the entry schema grows. Existing entries are
 * never touched: Estate only appends.
 */

import {
    createNewWorldInfo,
    createWorldInfoEntry,
    loadWorldInfo,
    METADATA_KEY,
    reloadEditor,
    saveWorldInfo,
    updateWorldInfoList,
    world_names,
} from '../../../world-info.js';
import { user_avatar } from '../../../personas.js';
import { NAME_MAX } from './settings.js';

/** Marker written on every entry Estate creates, for later identification. */
export const STAMP = 'estate';

/**
 * Title badges. Everything lands in one lorebook, so the entry list has to say
 * at a glance whose place a row describes. These sit in `comment`, which is a
 * memo for the editor and plays no part in keyword matching.
 */
export const BADGE = Object.freeze({
    character: '🎭',
    persona: '👤',
    shared: '👥',
    place: '🏛️',
});

/**
 * Prefix an entry title with its badge and, for a home, its owner.
 *
 * @param {string} title
 * @param {{mode?: 'home'|'place', target?: string, owner?: string}} origin
 * @returns {string}
 */
export function decorateTitle(title, origin = {}) {
    const text = String(title || '').trim() || 'Entry';
    if (origin.mode === 'place') return `${BADGE.place} ${text}`;

    const badge = BADGE[origin.target] || BADGE.character;
    const owner = String(origin.owner || '').trim();
    return owner ? `${badge} ${owner} — ${text}` : `${badge} ${text}`;
}

/** `world_info_position` values, mirrored so this module needs no extra import. */
export const POSITION = Object.freeze({
    before: 0,
    after: 1,
    atDepth: 4,
});

/** Ordering tiers, following the position/order convention. */
export const ORDER = Object.freeze({
    home: 110,
    room: 105,
});

export const DEPTH = Object.freeze({
    home: 3,
    room: 3,
});

function ctx() {
    return SillyTavern.getContext();
}

/** @returns {string[]} every known lorebook name. */
export function listLorebooks() {
    return Array.isArray(world_names) ? [...world_names] : [];
}

/** @returns {string} the lorebook currently bound to the open chat, if any. */
export function chatLorebook() {
    return ctx().chatMetadata?.[METADATA_KEY] || '';
}

/**
 * Expand `{char}`, `{user}` and `{chat}`, strip characters the filesystem
 * rejects, then append a number if the name is already taken.
 *
 * @param {string} template
 * @returns {string}
 */
export function buildLorebookName(template) {
    const context = ctx();
    const source = String(template || '').trim() || 'Estate - {char}';

    const name = source
        .replaceAll('{char}', String(context.name2 || 'Character'))
        .replaceAll('{user}', String(context.name1 || 'User'))
        .replaceAll('{chat}', String(context.getCurrentChatId?.() || 'chat'))
        .replace(/[\\/:*?"<>|\n\r\t]+/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, NAME_MAX) || 'Estate';

    const taken = new Set(listLorebooks());
    if (!taken.has(name)) return name;

    for (let suffix = 2; suffix <= 999; suffix++) {
        const candidate = `${name} ${suffix}`;
        if (!taken.has(candidate)) return candidate;
    }
    return `${name} ${Date.now()}`;
}

/**
 * Attach a lorebook to the chat, the character card or the active persona.
 *
 * @param {string} name
 * @param {'chat'|'character'|'persona'|'none'} target
 * @returns {Promise<boolean>} whether the binding actually happened
 */
export async function bindLorebook(name, target) {
    const context = ctx();
    if (!name || target === 'none') return false;

    if (target === 'chat') {
        if (!context.getCurrentChatId?.()) return false;
        context.chatMetadata[METADATA_KEY] = name;
        await context.saveMetadata();
        return true;
    }

    if (target === 'character') {
        const characterId = context.characterId;
        if (characterId === undefined || characterId === null) return false;
        await context.writeExtensionField(characterId, 'world', name);
        const character = context.characters?.[characterId];
        if (character?.data?.extensions) character.data.extensions.world = name;
        return true;
    }

    if (target === 'persona') {
        const powerUser = context.powerUserSettings;
        if (!powerUser) return false;
        powerUser.persona_description_lorebook = name;
        const descriptor = powerUser.persona_descriptions?.[user_avatar];
        if (descriptor) descriptor.lorebook = name;
        context.saveSettingsDebounced();
        return true;
    }

    return false;
}

/**
 * Assemble the text body of one entry: the prose, then the visual tag block
 * that image prompts actually feed on.
 *
 * @param {{content: string, visual?: string}} entry
 * @returns {string}
 */
export function composeContent(entry) {
    const body = String(entry?.content || '').trim();
    const visual = String(entry?.visual || '').trim();
    if (!visual) return body;
    return `${body}\n\n[Visual: ${visual}]`;
}

/**
 * Append entries to a lorebook, creating it first when asked.
 *
 * @param {object[]} entries Draft entries: `{title, content, visual, keys}`
 *        where `keys` are already-compiled keyword strings.
 * @param {object} options
 * @param {string} options.name Target lorebook name.
 * @param {boolean} [options.create] Create the lorebook before writing.
 * @param {'chat'|'character'|'persona'|'none'} [options.bind] Binding to apply
 *        after a successful creation.
 * @param {{mode?: 'home'|'place', target?: string, owner?: string}} [options.origin]
 *        Whose place this is, for the title badge.
 * @returns {Promise<{written: number, name: string, bound: boolean, bindFailed: boolean}>}
 */
export async function writeEntries(entries, options) {
    const list = Array.isArray(entries) ? entries.filter(entry => entry && entry.content) : [];
    const name = String(options?.name || '').trim();
    if (!name) throw new Error('No lorebook name given.');
    if (!list.length) return { written: 0, name, bound: false, bindFailed: false };

    let bound = false;
    let bindFailed = false;

    if (options.create) {
        const created = await createNewWorldInfo(name);
        if (!created) {
            const error = new Error(`Could not create the lorebook "${name}".`);
            error.code = 'createFailed';
            error.book = name;
            throw error;
        }
        await updateWorldInfoList();

        try {
            bound = await bindLorebook(name, options.bind || 'none');
        } catch (error) {
            console.error('[Estate] binding failed', error);
            bindFailed = true;
        }
    }

    const data = await loadWorldInfo(name);
    if (!data) throw new Error(`Could not load the lorebook "${name}".`);
    if (!data.entries || typeof data.entries !== 'object') data.entries = {};

    let written = 0;
    for (const draft of list) {
        const entry = createWorldInfoEntry(name, data);
        if (!entry) continue;

        entry.comment = decorateTitle(draft.title || 'Home', options.origin).slice(0, 120);
        entry.content = composeContent(draft);
        entry.key = Array.isArray(draft.keys) ? draft.keys.filter(Boolean) : [];
        entry.keysecondary = [];

        // Keyed, depth-anchored entries: present when the place comes up,
        // absent when it does not.
        entry.constant = false;
        entry.selective = true;
        entry.disable = false;
        entry.position = POSITION.atDepth;
        entry.role = 0;
        entry.depth = Number.isFinite(draft.depth) ? draft.depth : DEPTH.home;
        entry.order = Number.isFinite(draft.order) ? draft.order : ORDER.home;
        entry.probability = 100;
        entry.useProbability = true;

        // A home description must never pull in unrelated entries, and must
        // never be dragged in by another entry's recursion pass.
        entry.excludeRecursion = true;
        entry.preventRecursion = true;

        entry.automationId = '';
        entry[`${STAMP}_created`] = new Date().toISOString();
        entry[`${STAMP}_mode`] = options.origin?.mode === 'place' ? 'place' : 'home';
        if (draft.room) entry[`${STAMP}_room`] = String(draft.room).slice(0, 60);

        written++;
    }

    await saveWorldInfo(name, data, true);

    try {
        await Promise.resolve(reloadEditor(name));
    } catch (error) {
        console.warn('[Estate] reloadEditor failed', error);
    }

    return { written, name, bound, bindFailed };
}
