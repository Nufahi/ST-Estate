/** Run-local context and pure helpers, also used by the review step. */
export function snapshotContext(context, personaAvatar = '') {
    const fields = structuredClone(context.getCharacterCardFields?.() || {});
    const chatId = context.getCurrentChatId?.();
    return {
        ...context,
        personaAvatar,
        characters: { [context.characterId]: structuredClone(context.characters?.[context.characterId] || null) },
        chat: structuredClone(context.chat || []),
        chatMetadata: structuredClone(context.chatMetadata || {}),
        powerUserSettings: structuredClone(context.powerUserSettings || {}),
        getCurrentChatId: () => chatId,
        getCharacterCardFields: () => fields,
    };
}

export function sameChat(context) {
    const live = SillyTavern.getContext();
    return live.getCurrentChatId?.() === context.getCurrentChatId?.()
        && live.characters?.[live.characterId]?.avatar === context.characters?.[context.characterId]?.avatar;
}

export const normalizeId = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

export function entryIdentity(entry) {
    return JSON.stringify([entry.ownerId, normalizeId(entry.room || entry.facet || 'whole')]);
}

/** Match the native primary OR + secondary AND ANY configuration we write. */
export function matchingKeys(keys, text) {
    return (keys || []).filter(key => {
        const regex = /^\/(.+)\/([a-z]*)$/s.exec(key);
        try {
            return regex ? new RegExp(regex[1], regex[2]).test(text)
                : String(text).toLowerCase().includes(String(key).toLowerCase());
        } catch { return false; }
    });
}

export function activation(entry, text) {
    const primary = matchingKeys(entry.keys, text);
    const secondary = matchingKeys(entry.scopeKeys, text);
    return { active: primary.length > 0 && (!entry.scopeKeys?.length || secondary.length > 0), primary, secondary };
}

export function continuity(entries, limit = 6000) {
    if (!entries.length) return '';
    const allowance = Math.max(120, Math.floor(limit / entries.length));
    return entries.map(entry => `${entry.title}: ${entry.content}`.slice(0, allowance)).join('\n').slice(0, limit);
}

/** Rank all candidates before clipping; round-robin books prevents starvation. */
export function selectLore(candidates, query, limit = 6000) {
    const terms = [...new Set(normalizeId(query).match(/[\p{L}\p{N}_-]{3,}/gu) || [])];
    const groups = new Map();
    for (const item of candidates) {
        const haystack = normalizeId(`${item.label} ${item.body}`);
        const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
        const list = groups.get(item.book) || [];
        list.push({ ...item, score });
        groups.set(item.book, list);
    }
    for (const list of groups.values()) list.sort((a, b) => b.score - a.score);
    const result = [];
    let remaining = limit;
    while (remaining > 0 && result.length < 40) {
        const heads = [...groups.values()].filter(list => list.length).sort((a, b) => b[0].score - a[0].score);
        if (!heads.length) break;
        for (const list of heads) {
            if (remaining <= 0 || result.length >= 40) break;
            const item = list.shift();
            const text = `[${item.book}] ${item.label}: ${item.body}`.slice(0, Math.min(600, remaining));
            result.push(text);
            remaining -= text.length + 2;
        }
    }
    return result.join('\n\n');
}

export function revisionInstruction(entry, note, siblings) {
    return `REVISION — overrides the normal entry plan. Return exactly ONE entry. Preserve its room/facet id: ${entry.room || entry.facet || 'whole'}.\nCurrent draft:\n${JSON.stringify(entry)}\nAuthor's requested change:\n${note}\nOther accepted drafts (keep consistent):\n${continuity(siblings)}`;
}

export function checkCoverage(result, expected, field) {
    if (!result.ok) return result;
    const seen = new Set();
    result.entries = result.entries.filter(entry => {
        if (expected.length === 1 && expected[0] === 'whole') entry[field] = 'whole';
        const id = normalizeId(entry[field]);
        if (expected.length && !expected.some(value => normalizeId(String(value).slice(0, 60)) === id)) return false;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });
    result.missing = expected.filter(id => !seen.has(normalizeId(String(id).slice(0, 60))));
    result.keyless = result.entries.filter(entry => !entry.keys.length).length;
    if (!result.entries.length) { result.ok = false; result.error = 'No requested entry IDs returned'; }
    return result;
}
