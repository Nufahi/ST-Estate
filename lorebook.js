/**
 * Estate — lorebook writing.
 *
 * New entries use SillyTavern's native entry factory. Updates are restricted
 * to Estate-stamped entries, by stable identity or explicit review selection.
 */

import {
    createNewWorldInfo,
    createWorldInfoEntry,
    loadWorldInfo,
    METADATA_KEY,
    reloadEditor,
    saveWorldInfo,
    updateWorldInfoList,
    world_info,
    world_names,
} from '../../../world-info.js';
import { user_avatar } from '../../../personas.js';
import { NAME_MAX } from './settings.js';
import { entryIdentity, selectLore } from './workflow.js';

/** Marker written on every entry Estate creates, for later identification. */
export const STAMP = 'estate';

/**
 * Title badges. Everything lands in one lorebook, so the entry list has to say
 * at a glance whose place a row describes. These sit in `comment`, which is a
 * memo for the editor and plays no part in keyword matching.
 *
 * One glyph per owner is the whole mechanism: the character's home, the
 * user's, the one they share and a building nobody lives in each get their
 * own, and the row then needs nothing but the name of the room. Spelling the
 * owner out instead — "🎭 Anna — Kitchen" — repeated the same name down every
 * row of the list and pushed the part that actually differs off the edge on a
 * phone.
 */
export const BADGE = Object.freeze({
    character: '🎭',
    persona: '👤',
    shared: '👥',
    place: '🏛️',
});

/**
 * Prefix an entry title with its badge, and — for a building — its name.
 *
 * The place name stays because it is the only thing telling two taverns in one
 * lorebook apart. A home needs no such thing: the badge already says whose it
 * is, and the character's name is on the chat.
 *
 * @param {string} title
 * @param {{mode?: 'home'|'place', target?: string, place?: string}} origin
 * @returns {string}
 */
export function decorateTitle(title, origin = {}) {
    const text = String(title || '').trim() || 'Entry';

    if (origin.mode === 'place') {
        const place = String(origin.place || '').trim();
        // A model handed a place name usually works it into the title already;
        // prefixing it again would read "The Drowned Crow — The Drowned Crow".
        const named = place && !text.toLowerCase().includes(place.toLowerCase());
        return named ? `${BADGE.place} ${place} — ${text}` : `${BADGE.place} ${text}`;
    }

    return `${BADGE[origin.target] || BADGE.character} ${text}`;
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
 * Books bound to the character card: the primary `world` field plus any extra
 * books attached through the character's lorebook list.
 *
 * @returns {string[]}
 */
export function characterLorebooks(context = ctx()) {
    const names = [];

    const character = context.characters?.[context.characterId];
    const primary = character?.data?.extensions?.world;
    if (typeof primary === 'string' && primary.trim()) names.push(primary.trim());

    // Auxiliary books live in a separate list keyed by the card filename.
    const key = String(character?.avatar || '').replace(/\.[^.]+$/, '');
    const extra = key && Array.isArray(world_info?.charLore)
        ? world_info.charLore.find(entry => entry?.name === key)
        : null;
    for (const name of Array.isArray(extra?.extraBooks) ? extra.extraBooks : []) {
        if (typeof name === 'string' && name.trim()) names.push(name.trim());
    }

    return [...new Set(names)];
}

/**
 * Read the lorebooks attached to this chat and character as source material.
 *
 * Include earlier generated entries and the destination; rank before clipping
 * so large memory books cannot displace all character/location material.
 *
 * @returns {Promise<string>} plain text, empty when there is nothing to read
 */
export async function readBoundLore(context = ctx(), query = '', destination = '') {
    const names = [...new Set([context.chatMetadata?.[METADATA_KEY], ...characterLorebooks(context), destination].filter(Boolean))];
    if (!names.length) return '';

    const candidates = [];

    for (const name of names) {

        let data;
        try {
            data = await loadWorldInfo(name);
        } catch (error) {
            console.warn(`[Estate] could not read lorebook "${name}"`, error);
            continue;
        }
        if (!data?.entries || typeof data.entries !== 'object') continue;

        for (const entry of Object.values(data.entries)) {
            if (!entry || entry.disable) continue;

            const body = String(entry.content || '').replace(/\s+/g, ' ').trim();
            if (!body) continue;

            const label = String(entry.comment || '').replace(/\s+/g, ' ').trim();
            candidates.push({ book: name, label, body });
        }
    }

    return selectLore(candidates, query);
}

/**
 * Expand `{char}`, `{user}` and `{chat}`, strip characters the filesystem
 * rejects, then append a number if the name is already taken.
 *
 * @param {string} template
 * @returns {string}
 */
export function buildLorebookName(template, context = ctx()) {
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
 * Add a book to the character's auxiliary lorebook list, leaving the primary
 * `world` field untouched. This is the same list the "Character Lore" panel
 * edits, keyed by the card's avatar filename without its extension.
 *
 * @returns {boolean} whether the book is now attached
 */
function attachAuxiliaryBook(context, character, name) {
    const key = String(character?.avatar || '').replace(/\.[^.]+$/, '');
    if (!key || !world_info) return false;

    if (character?.data?.extensions?.world === name) return true;

    if (!Array.isArray(world_info.charLore)) world_info.charLore = [];

    let record = world_info.charLore.find(entry => entry?.name === key);
    if (!record) {
        record = { name: key, extraBooks: [] };
        world_info.charLore.push(record);
    }
    if (!Array.isArray(record.extraBooks)) record.extraBooks = [];

    if (!record.extraBooks.includes(name)) record.extraBooks.push(name);
    context.saveSettingsDebounced();
    return true;
}

/**
 * Attach a lorebook to the character card or the active persona.
 * Legacy chat requests use the auxiliary card list, never the chat slot.
 *
 * @param {string} name
 * @param {'chat'|'character'|'persona'|'none'} target
 * @returns {Promise<boolean>} whether the binding actually happened
 */
export async function bindLorebook(name, target, context = ctx()) {
    if (!name || target === 'none') return false;

    if (target === 'chat') target = 'character';

    if (target === 'character') {
        const characterId = context.characterId;
        if (characterId === undefined || characterId === null) return false;

        const character = context.characters?.[characterId];
        return attachAuxiliaryBook(context, character, name);
    }

    if (target === 'persona') {
        const powerUser = ctx().powerUserSettings;
        if (!powerUser) return false;
        const avatar = context.personaAvatar ?? user_avatar;
        if (avatar === user_avatar) powerUser.persona_description_lorebook = name;
        const descriptor = powerUser.persona_descriptions?.[avatar];
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
 * @param {{mode?: 'home'|'place', target?: string, place?: string}} [options.origin]
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
        options.create = false;
        options.attachAfterSave = true;
        await updateWorldInfoList();
    }

    const data = structuredClone(await loadWorldInfo(name));
    if (!data) throw new Error(`Could not load the lorebook "${name}".`);
    if (!data.entries || typeof data.entries !== 'object') data.entries = {};

    let written = 0;
    const updated = new Set();
    for (const draft of list) {
        const id = draft.ownerId ? entryIdentity(draft) : '';
        const match = options.writeMode !== 'variant' && Object.values(data.entries).find(item =>
            item?.[`${STAMP}_created`] && (draft.replaceUid != null ? String(item.uid) === String(draft.replaceUid)
                : id && item[`${STAMP}_id`] === id));
        const entry = match || createWorldInfoEntry(name, data);
        if (!entry) continue;
        if (updated.has(entry.uid)) throw new Error('Two drafts target the same entry. Choose separate destinations or create variants.');
        updated.add(entry.uid);

        // An entry knows which building it describes when the run wrote several;
        // the run's own origin is the fallback for the ordinary single-place case.
        const origin = draft.origin || options.origin;

        entry.comment = decorateTitle(draft.title || 'Home', origin).slice(0, 120);
        entry.content = composeContent(draft);
        entry.key = Array.isArray(draft.keys) ? draft.keys.filter(Boolean) : [];
        if (draft.room !== 'whole' && draft.origin?.place) {
            entry.key = entry.key.filter(key => key.toLowerCase() !== draft.origin.place.toLowerCase());
        }
        entry.keysecondary = draft.scopeKeys || [];
        entry.selectiveLogic = 0; // AND ANY: topic AND one scope alias.
        entry.scanDepth = 4;
        entry.caseSensitive = false;
        entry.matchWholeWords = false;

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
        for (const field of ['matchPersonaDescription', 'matchCharacterDescription', 'matchCharacterPersonality', 'matchCharacterDepthPrompt', 'matchScenario', 'matchCreatorNotes']) entry[field] = false;

        entry.automationId = '';
        entry[`${STAMP}_created`] ||= new Date().toISOString();
        entry[`${STAMP}_updated`] = new Date().toISOString();
        if (id) entry[`${STAMP}_id`] = id;
        entry[`${STAMP}_owner`] = draft.ownerId || '';
        entry[`${STAMP}_mode`] = origin?.mode === 'place' ? 'place' : 'home';
        if (draft.room) entry[`${STAMP}_room`] = String(draft.room).slice(0, 60);

        written++;
    }

    await saveWorldInfo(name, data, true);
    if (options.attachAfterSave) {
        try {
            bound = await bindLorebook(name, options.bind || 'none', options.context);
            bindFailed = !bound && !!options.bind && options.bind !== 'none';
            options.attachAfterSave = false;
        } catch (error) { console.error('[Estate] binding failed', error); bindFailed = true; }
    }

    try {
        await Promise.resolve(reloadEditor(name));
    } catch (error) {
        console.warn('[Estate] reloadEditor failed', error);
    }

    return { written, name, bound, bindFailed };
}

export async function existingEntries(name) {
    if (!name) return [];
    const data = await loadWorldInfo(name);
    return Object.values(data?.entries || {}).filter(entry => entry?.[`${STAMP}_created`]);
}
