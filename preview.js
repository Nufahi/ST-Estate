/**
 * Estate — review step.
 *
 * This is where raw keyword stems become regex patterns. The user sees both
 * the stem they can edit and the compiled pattern that will actually be
 * written, so a bad match can be spotted before it reaches the lorebook.
 */

import { button, node, textarea } from './dom.js';
import { buildingIcon, houseIcon } from './icon.js';
import { t } from './i18n.js';
import { compileKeys, describeKey } from './keys.js';

const KIND_LABEL = {
    stem: 'keyStem',
    exact: 'keyExact',
    suffix: 'keySuffix',
    group: 'keyGroup',
    plain: 'keyPlain',
};

/** Turn a key spec back into the single line the user edits. */
function specToLine(spec) {
    if (typeof spec === 'string') return spec;
    if (!spec || typeof spec !== 'object') return '';

    const mode = spec.mode || 'stem';
    const values = Array.isArray(spec.values) && spec.values.length
        ? spec.values.join('|')
        : String(spec.value || '');
    if (!values) return '';

    if (mode === 'suffix' && Array.isArray(spec.suffixes) && spec.suffixes.length) {
        return `${mode}: ${values} +${spec.suffixes.join(',')}`;
    }
    return `${mode}: ${values}`;
}

/**
 * Parse one edited line back into a key spec.
 * Accepted forms: `stem: кухн`, `group: couch|sofa`, `suffix: cook +s,ed,ing`,
 * or a bare word, which is treated as a stem.
 */
function lineToSpec(line) {
    const text = String(line || '').trim();
    if (!text) return null;

    const match = /^(stem|exact|group|suffix|proper)\s*:\s*(.+)$/i.exec(text);
    const mode = match ? match[1].toLowerCase() : (/\s/.test(text) ? 'proper' : 'stem');
    let body = match ? match[2].trim() : text;

    let suffixes;
    const suffixMatch = /\s\+([A-Za-z,'\s]+)$/.exec(body);
    if (suffixMatch && mode === 'suffix') {
        suffixes = suffixMatch[1].split(',').map(value => value.trim()).filter(Boolean);
        body = body.slice(0, suffixMatch.index).trim();
    }

    const values = body.split('|').map(value => value.trim()).filter(Boolean);
    if (!values.length) return null;

    const spec = { mode };
    if (values.length > 1) spec.values = values;
    else spec.value = values[0];
    if (suffixes?.length) spec.suffixes = suffixes;
    return spec;
}

/** One editable entry card. */
function buildEntryCard(entry, index, onChange) {
    const element = node('section', 'est-entry');

    const head = node('div', 'est-entry__head');
    const toggle = /** @type {HTMLInputElement} */ (node('input'));
    toggle.type = 'checkbox';
    toggle.checked = true;
    toggle.id = `estate_entry_${index}`;
    toggle.addEventListener('change', () => {
        element.classList.toggle('est-entry--off', !toggle.checked);
        onChange();
    });

    const title = /** @type {HTMLInputElement} */ (node('input', 'text_pole est-entry__title'));
    title.type = 'text';
    title.value = entry.title;
    title.maxLength = 120;
    title.setAttribute('aria-label', t('entryTitle'));

    head.append(toggle, title);

    // A scouted run reviews several buildings at once, and "Main hall" three
    // times over says nothing about which one. The name of the place is what
    // tells the rows apart, so it sits above each title.
    const place = String(entry.origin?.place || '').trim();
    if (place) head.appendChild(node('span', 'est-entry__place', place));

    element.appendChild(head);

    const body = node('div', 'est-entry__body');

    const content = textarea(7, entry.content);
    content.setAttribute('aria-label', t('entryContent'));
    body.append(node('div', 'est-entry__label', t('entryContent')), content);

    const visual = textarea(2, entry.visual);
    visual.setAttribute('aria-label', t('entryVisual'));
    body.append(
        node('div', 'est-entry__label', t('entryVisual')),
        visual,
        node('p', 'est-hint', t('entryVisualHint')),
    );

    const keyLines = entry.keys.map(specToLine).filter(Boolean).join('\n');
    const keys = textarea(Math.min(10, Math.max(3, entry.keys.length)), keyLines);
    keys.setAttribute('aria-label', t('entryKeys'));

    const compiled = node('div', 'est-keys');
    const warning = node('p', 'est-warn');
    warning.hidden = true;

    const recompile = () => {
        const specs = keys.value.split('\n').map(lineToSpec).filter(Boolean);
        const result = compileKeys(specs);

        compiled.replaceChildren();
        for (const key of result.keys) {
            const described = describeKey(key);
            const chip = node('span', 'est-key');
            chip.append(
                node('span', 'est-key__text', described.text),
                node('span', 'est-key__kind', t(KIND_LABEL[described.kind] || 'keyPlain')),
            );
            chip.title = key;
            compiled.appendChild(chip);
        }

        if (!result.keys.length) {
            warning.textContent = t('noKeys');
            warning.hidden = false;
        } else if (result.rejected.length) {
            warning.textContent = t('keyRejected', { n: result.rejected.length });
            warning.hidden = false;
        } else {
            warning.hidden = true;
        }

        element.dataset.keyCount = String(result.keys.length);
        return result.keys;
    };

    keys.addEventListener('input', () => { recompile(); onChange(); });

    body.append(
        node('div', 'est-entry__label', t('entryKeys')),
        keys,
        node('p', 'est-hint', t('keysHint')),
        compiled,
        warning,
    );

    element.appendChild(body);
    recompile();

    return {
        element,
        enabled: () => toggle.checked,
        read: () => ({
            title: title.value.trim() || entry.title,
            room: entry.room,
            content: content.value.trim(),
            visual: visual.value.trim(),
            keys: recompile(),
            order: entry.order,
            depth: entry.depth,
            // Carried rather than recomputed: one review can hold several
            // buildings, and the badge on a row belongs to the place that row
            // came from, not to whatever the run finished on.
            origin: entry.origin,
        }),
    };
}

/**
 * Show the review dialog.
 *
 * @param {object[]} entries Draft entries straight from the parser.
 * @param {{book: string, isNew: boolean, mode?: 'home'|'place'}} destination
 * @param {(entries: object[]) => Promise<boolean>} onWrite
 * @returns {Promise<boolean>} whether entries were written
 */
export async function openPreview(entries, destination, onWrite) {
    const context = SillyTavern.getContext();
    const root = node('div', 'est-preview');

    const title = node('div', 'est-title');
    const heading = node('h3', '', t('previewTitle'));
    heading.id = 'estate_preview_title';
    const glyph = node('span', 'est-title__glyph');
    glyph.appendChild(destination.mode === 'place' ? buildingIcon() : houseIcon());
    title.append(glyph, heading);
    root.append(title, node('p', 'est-intro', t('previewIntro')));

    // Declared up front because the summary updater enables and disables it.
    const write = button(t('write'), 'fa-solid fa-book-medical');
    write.classList.add('est-write');

    const summary = node('div', 'est-summary');
    const toolbar = node('div', 'est-preview__toolbar');
    const selectAll = button(t('selectAll'), 'fa-solid fa-check-double');
    const selectNone = button(t('selectNone'), 'fa-solid fa-xmark');
    toolbar.append(summary, selectAll, selectNone);
    root.appendChild(toolbar);

    const cards = [];
    const updateSummary = () => {
        const active = cards.filter(entry => entry.enabled()).length;
        const key = destination.isNew ? 'previewNewBook' : 'previewInto';
        summary.textContent = t(key, { n: active, total: cards.length, book: destination.book });
        write.disabled = active === 0;
    };

    const list = node('div', 'est-preview__list');
    entries.forEach((entry, index) => {
        const built = buildEntryCard(entry, index, () => updateSummary());
        cards.push(built);
        list.appendChild(built.element);
    });
    root.appendChild(list);

    const actions = node('div', 'est-actions');
    actions.appendChild(write);
    root.appendChild(actions);

    selectAll.addEventListener('click', () => {
        for (const entry of cards) {
            const toggle = entry.element.querySelector('input[type="checkbox"]');
            if (toggle && !toggle.checked) toggle.click();
        }
    });
    selectNone.addEventListener('click', () => {
        for (const entry of cards) {
            const toggle = entry.element.querySelector('input[type="checkbox"]');
            if (toggle && toggle.checked) toggle.click();
        }
    });

    updateSummary();

    const popup = new context.Popup(root, context.POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        okButton: t('writeBack'),
        cancelButton: false,
        onClosing: () => !root.classList.contains('est-preview--busy'),
    });
    popup.dlg?.setAttribute('aria-labelledby', heading.id);

    let written = false;

    write.addEventListener('click', async () => {
        const selected = cards
            .filter(entry => entry.enabled())
            .map(entry => entry.read())
            .filter(entry => entry.content);

        if (!selected.length) {
            toastr.info(t('toastNothingSelected'), t('title'));
            return;
        }

        root.classList.add('est-preview--busy');
        write.disabled = true;
        try {
            written = await onWrite(selected);
        } catch (error) {
            console.error('[Estate] write', error);
            written = false;
        } finally {
            root.classList.remove('est-preview--busy');
            write.disabled = false;
        }

        if (written) popup.complete(context.POPUP_RESULT.AFFIRMATIVE);
    });

    await popup.show();
    return written;
}
