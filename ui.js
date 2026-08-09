/**
 * Estate — the main dialog.
 *
 * Chip picks are written straight into the live settings object as the user
 * clicks, so the next time the dialog opens it looks exactly as they left it.
 */

import { MODES, customId, sectionsFor } from './catalog.js';
import { button, card, checkbox, field, hint, input, node, segmented, select, textarea } from './dom.js';
import { buildingIcon, houseIcon } from './icon.js';
import { language, t } from './i18n.js';
import { chatLorebook, listLorebooks } from './lorebook.js';
import {
    BINDINGS,
    CUSTOM_TAG_MAX,
    DETAILS,
    GRANULARITY,
    HISTORY_LIMITS,
    LANGUAGES,
    TARGETS,
    addCustomTag,
    clampInt,
    customTagsFull,
    DETAIL_WORDS,
    getSettings,
    removeCustomTag,
    resolveProfileId,
    saveSettings,
    supportedProfiles,
} from './settings.js';

const WAND_ID = 'estate_wand_button';
const NEW_BOOK = '\u0000new';

let menuObserver = null;
let dialogOpen = false;

function closeWandMenu() {
    const menu = document.getElementById('extensionsMenu');
    if (menu) menu.style.display = 'none';
}

/**
 * Chip grid for one catalog section, wired directly to `settings.picks`.
 * Catalog chips come first, then the user's own tags, then the add control.
 */
function buildSection(section, settings, lang) {
    const label = section[lang] || section.en;
    const counter = node('span', 'est-card__count');
    const limit = section.multi
        ? t('pickUpTo', { n: section.max || section.chips.length })
        : t('pickOne');

    const heading = node('span', 'est-card__meta', limit);
    const { card: element, body, heading: headingRow } = card(label, heading);
    headingRow.appendChild(counter);

    const grid = node('div', 'est-chips');
    const chosen = new Set(settings.picks[section.id] || []);
    const buttons = new Map();

    const sync = () => {
        for (const [id, chip] of buttons) chip.setAttribute('aria-pressed', String(chosen.has(id)));
        counter.textContent = chosen.size ? t('sectionCount', { n: chosen.size }) : '';
        settings.picks[section.id] = [...chosen];
        saveSettings();
    };

    /** Selecting honours the section cap and the single-choice rule alike. */
    const toggle = id => {
        if (chosen.has(id)) {
            chosen.delete(id);
        } else if (section.multi) {
            const cap = section.max || section.chips.length;
            if (chosen.size >= cap) {
                toastr.info(t('limitReached', { n: cap, section: label }), t('title'));
                return;
            }
            chosen.add(id);
        } else {
            chosen.clear();
            chosen.add(id);
        }
        sync();
    };

    for (const chip of section.chips) {
        const control = /** @type {HTMLButtonElement} */ (node('button', 'est-chip', chip[lang] || chip.en));
        control.type = 'button';
        control.title = chip.prompt;
        control.addEventListener('click', () => toggle(chip.id));
        buttons.set(chip.id, control);
        grid.appendChild(control);
    }

    // The add control stays last, so newly created tags appear just before it.
    const add = /** @type {HTMLButtonElement} */ (node('button', 'est-chip est-chip--add', t('addCustom')));
    add.type = 'button';
    add.title = t('addCustomTitle', { section: label });

    /** Render one user-defined tag: a normal chip plus its own remove button. */
    const addCustomChip = (id, text) => {
        const control = /** @type {HTMLButtonElement} */ (node('button', 'est-chip est-chip--custom'));
        control.type = 'button';
        control.title = text;
        control.appendChild(node('span', 'est-chip__text', text));

        const remove = node('span', 'est-chip__remove', '×');
        remove.setAttribute('role', 'button');
        remove.setAttribute('aria-label', t('customRemove'));
        remove.title = t('customRemove');
        remove.addEventListener('click', event => {
            // Without this the click would also toggle the chip it sits on.
            event.stopPropagation();
            removeCustomTag(settings, section.id, id);
            chosen.delete(id);
            buttons.delete(id);
            control.remove();
            sync();
        });

        control.appendChild(remove);
        control.addEventListener('click', () => toggle(id));
        buttons.set(id, control);
        grid.insertBefore(control, add);
    };

    for (const text of settings.customTags[section.id] || []) {
        addCustomChip(customId(text), text);
    }
    grid.appendChild(add);

    // Inline editor rather than a nested popup: this dialog already lives
    // inside one, and stacking popups behaves badly on mobile.
    const editor = node('div', 'est-custom');
    editor.hidden = true;
    const entry = input('text', { maxlength: CUSTOM_TAG_MAX, placeholder: t('customPrompt', { section: label }) });
    entry.classList.add('est-custom__input');
    const confirm = button(t('addCustom'));
    confirm.classList.add('est-custom__ok');
    editor.append(entry, confirm);

    const commit = () => {
        const result = addCustomTag(settings, section.id, entry.value);
        if (!result.ok) {
            toastr.info(result.reason === 'full' ? t('customFull', { section: label }) : t('customEmpty'), t('title'));
            return;
        }
        if (!result.existed) addCustomChip(result.id, result.text);
        if (!chosen.has(result.id)) toggle(result.id);
        else sync();
        entry.value = '';
        entry.focus();
    };

    confirm.addEventListener('click', commit);
    entry.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            commit();
        } else if (event.key === 'Escape') {
            editor.hidden = true;
        }
    });

    add.addEventListener('click', () => {
        if (customTagsFull(settings, section.id)) {
            toastr.info(t('customFull', { section: label }), t('title'));
            return;
        }
        editor.hidden = !editor.hidden;
        if (!editor.hidden) entry.focus();
    });

    const clear = node('button', 'est-card__clear', t('clearSection'));
    clear.setAttribute('type', 'button');
    clear.addEventListener('click', () => {
        chosen.clear();
        sync();
    });
    headingRow.appendChild(clear);

    body.append(grid, editor);
    sync();
    return element;
}

function buildTargetSection(settings, lang) {
    const context = SillyTavern.getContext();
    const charName = String(context.name2 || t('targetChar'));
    const userName = String(context.name1 || t('targetPersona'));

    const { card: element, body } = card(t('target'));
    const control = segmented(
        [
            { id: 'character', label: charName },
            { id: 'persona', label: userName },
            { id: 'shared', label: t('targetShared') },
        ],
        TARGETS.includes(settings.target) ? settings.target : 'character',
        id => { settings.target = id; saveSettings(); },
    );
    body.append(control.row, hint(t('targetHint')));
    return { card: element, value: control.value };
}

function buildModelSection(settings) {
    const { card: element, body } = card(t('model'));
    const profiles = supportedProfiles();
    const context = SillyTavern.getContext();

    const control = /** @type {HTMLSelectElement} */ (node('select', 'text_pole'));
    control.appendChild(new Option(t('modelUseCurrent'), ''));

    const groups = new Map();
    for (const profile of profiles) {
        if (!profile?.id) continue;
        const api = context.CONNECT_API_MAP?.[profile.api]?.selected;
        const label = api === 'textgenerationwebui' ? t('modelTextCompletion') : t('modelChatCompletion');
        if (!groups.has(label)) {
            const group = document.createElement('optgroup');
            group.label = label;
            groups.set(label, group);
        }
        groups.get(label).appendChild(new Option(String(profile.name || profile.id), profile.id));
    }
    for (const group of groups.values()) control.appendChild(group);

    control.value = profiles.some(profile => profile?.id === settings.profileId) ? settings.profileId : '';
    control.disabled = !profiles.length;
    control.addEventListener('change', () => { settings.profileId = control.value; saveSettings(); });

    body.append(control, hint(profiles.length ? t('modelHint') : t('modelNoProfiles')));
    return { card: element, select: control };
}

function buildContextSection(settings) {
    const { card: element, body } = card(t('context'));
    const grid = node('div', 'est-toggle-grid');

    const card_ = checkbox('estate_ctx_card', t('ctxCard'), settings.useCard);
    const persona = checkbox('estate_ctx_persona', t('ctxPersona'), settings.usePersona);
    const history = checkbox('estate_ctx_history', t('ctxHistory'), settings.useHistory);
    grid.append(card_.row, persona.row, history.row);

    const count = input('number', {
        min: HISTORY_LIMITS.min,
        max: HISTORY_LIMITS.max,
        step: 1,
        value: settings.historyCount,
    });
    count.classList.add('est-number');
    const countField = field(t('ctxHistoryCount'), count);

    const syncHistory = () => countField.classList.toggle('est-field--off', !history.input.checked);
    history.input.addEventListener('change', syncHistory);
    syncHistory();

    body.append(grid, countField);
    return {
        card: element,
        read() {
            settings.useCard = card_.input.checked;
            settings.usePersona = persona.input.checked;
            settings.useHistory = history.input.checked;
            settings.historyCount = clampInt(count.value, HISTORY_LIMITS, settings.historyCount);
        },
    };
}

function buildOutputSection(settings) {
    const { card: element, body } = card(t('output'));

    const books = listLorebooks();
    const bound = chatLorebook();
    const options = [{ value: NEW_BOOK, label: t('lorebookNew') }];
    for (const name of books) options.push({ value: name, label: name });

    const stored = settings.createNew ? NEW_BOOK : settings.lorebookName;
    const initial = options.some(option => option.value === stored)
        ? stored
        : (bound && books.includes(bound) ? bound : NEW_BOOK);

    const bookSelect = select(options, initial);
    const bookField = field(t('lorebook'), bookSelect, t('lorebookHint'));

    const nameInput = input('text', { maxlength: 120, value: settings.nameTemplate });
    const nameField = field(t('nameTemplate'), nameInput, t('nameTemplateHint'));

    const bindSelect = select([
        { value: 'chat', label: t('bindChat') },
        { value: 'character', label: t('bindCharacter') },
        { value: 'persona', label: t('bindPersona') },
        { value: 'none', label: t('bindNone') },
    ], BINDINGS.includes(settings.bind) ? settings.bind : 'chat');
    const bindField = field(t('bind'), bindSelect, t('bindHint'));

    const syncNew = () => {
        const creating = bookSelect.value === NEW_BOOK;
        nameField.classList.toggle('est-field--off', !creating);
        bindField.classList.toggle('est-field--off', !creating);
    };
    bookSelect.addEventListener('change', syncNew);
    syncNew();

    const detail = segmented([
        { id: 'brief', label: t('detailBrief') },
        { id: 'normal', label: t('detailNormal') },
        { id: 'rich', label: t('detailRich') },
    ], DETAILS.includes(settings.detail) ? settings.detail : 'normal');
    const detailHint = hint('');
    const syncDetail = () => { detailHint.textContent = t('detailHint', { n: DETAIL_WORDS[detail.value()] }); };
    for (const item of detail.buttons) item.addEventListener('click', syncDetail);
    syncDetail();

    const granularity = segmented([
        { id: 'single', label: t('granularityOne') },
        { id: 'rooms', label: t('granularityRooms') },
    ], GRANULARITY.includes(settings.granularity) ? settings.granularity : 'single');

    const splitLabel = granularity.buttons[1];
    const splitHint = hint('');
    const granularityField = field(t('granularity'), granularity.row);
    granularityField.appendChild(splitHint);

    const languageSelect = select([
        { value: 'auto', label: t('langAuto') },
        { value: 'en', label: t('langEn') },
        { value: 'ru', label: t('langRu') },
    ], LANGUAGES.includes(settings.language) ? settings.language : 'auto');

    body.append(
        bookField,
        nameField,
        bindField,
        field(t('detail'), detail.row),
        detailHint,
        granularityField,
        field(t('language'), languageSelect, t('languageNote')),
    );

    return {
        card: element,
        /** Homes are split by room, buildings by zone. */
        setMode(mode) {
            const place = mode === 'place';
            splitLabel.textContent = place ? t('granularityZones') : t('granularityRooms');
            splitHint.textContent = place ? t('granularityHintPlace') : t('granularityHint');
        },
        read() {
            const creating = bookSelect.value === NEW_BOOK;
            settings.createNew = creating;
            settings.lorebookName = creating ? '' : bookSelect.value;
            settings.nameTemplate = nameInput.value.trim() || settings.nameTemplate;
            settings.bind = bindSelect.value;
            settings.detail = detail.value();
            settings.granularity = granularity.value();
            settings.language = languageSelect.value;
        },
    };
}

function setBusy(root, busy) {
    root.classList.toggle('est-dialog--busy', busy);
    const action = root.querySelector('.est-generate');
    const stop = root.querySelector('.est-stop');
    const status = root.querySelector('.est-status');
    if (action) /** @type {HTMLButtonElement} */ (action).disabled = busy;
    if (stop) /** @type {HTMLElement} */ (stop).hidden = !busy;
    if (status) {
        /** @type {HTMLElement} */ (status).hidden = !busy;
        status.textContent = t('generating');
    }
}

/** True when at least one tag on the active board or some free text is present. */
function hasBrief(settings, mode, extraValue) {
    if (String(extraValue || '').trim()) return true;
    return sectionsFor(mode).some(section => (settings.picks[section.id] || []).length > 0);
}

/** The place-name field, shown only on the places board. */
function buildPlaceNameSection(settings) {
    const { card: element, body } = card(t('placeName'));
    const control = input('text', { maxlength: 60, value: settings.placeName });
    body.append(control, hint(t('placeNameHint')));
    control.placeholder = t('placeNamePlaceholder');
    return { card: element, read: () => control.value.trim() };
}

/**
 * Open the Estate dialog.
 *
 * @param {(settings: object, hooks: {status: (text: string) => void}) => Promise<boolean>} onGenerate
 *        Resolves true when the flow finished and the dialog should close.
 * @param {() => boolean} onCancel
 */
export async function openDialog(onGenerate, onCancel) {
    if (dialogOpen) return;

    const context = SillyTavern.getContext();
    const settings = getSettings();
    const lang = language();

    if (!resolveProfileId(settings) && context.mainApi !== 'openai' && !supportedProfiles().length) {
        toastr.warning(t('toastNoApi'), t('title'));
        return;
    }

    const root = node('div', 'est-dialog');

    const title = node('div', 'est-title');
    const glyph = node('span', 'est-title__glyph');
    glyph.appendChild(houseIcon());
    const heading = node('h3', '', t('title'));
    heading.id = 'estate_dialog_title';
    title.append(glyph, heading);
    root.append(title, node('p', 'est-intro', t('intro')));

    let mode = MODES.includes(settings.mode) ? settings.mode : 'home';

    // Both boards are built once and swapped by hidden flag: rebuilding them on
    // every switch would throw away half-typed custom tags and scroll position.
    const tabs = node('div', 'est-tabs');
    const panels = node('div', 'est-panels');
    const boards = {};

    for (const id of MODES) {
        const tab = /** @type {HTMLButtonElement} */ (node('button', 'est-tab'));
        tab.type = 'button';
        tab.setAttribute('role', 'tab');
        tab.appendChild(id === 'place' ? buildingIcon('est-tab__icon') : houseIcon('est-tab__icon'));
        tab.appendChild(node('span', '', t(id === 'place' ? 'tabPlace' : 'tabHome')));
        tab.title = t(id === 'place' ? 'tabPlaceHint' : 'tabHomeHint');

        const panel = node('div', 'est-panel');
        panel.setAttribute('role', 'tabpanel');

        const identity = id === 'home' ? buildTargetSection(settings, lang) : buildPlaceNameSection(settings);
        panel.appendChild(identity.card);
        for (const section of sectionsFor(id)) {
            panel.appendChild(buildSection(section, settings, lang));
        }

        boards[id] = { tab, panel, identity };
        tabs.appendChild(tab);
        panels.appendChild(panel);
    }

    const output = buildOutputSection(settings);

    const applyMode = () => {
        for (const id of MODES) {
            const active = id === mode;
            boards[id].tab.setAttribute('aria-selected', String(active));
            boards[id].panel.hidden = !active;
        }
        glyph.replaceChildren(mode === 'place' ? buildingIcon() : houseIcon());
        // The split control names rooms for homes and zones for buildings.
        output.setMode(mode);
    };

    for (const id of MODES) {
        boards[id].tab.addEventListener('click', () => {
            if (mode === id) return;
            mode = id;
            settings.mode = id;
            saveSettings();
            applyMode();
        });
    }

    root.append(tabs, panels);

    const extraCard = card(t('extra'));
    const extra = textarea(3, settings.extra, t('extraPlaceholder'));
    extraCard.body.append(extra, hint(t('extraHint')));
    root.appendChild(extraCard.card);

    const model = buildModelSection(settings);
    const contextSection = buildContextSection(settings);
    root.append(model.card, contextSection.card, output.card);
    applyMode();

    const status = node('div', 'est-status');
    status.hidden = true;
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    const actions = node('div', 'est-actions');
    const stop = button(t('stop'), 'fa-solid fa-stop');
    stop.classList.add('est-stop');
    stop.hidden = true;
    const generate = button(t('generate'), 'fa-solid fa-wand-magic-sparkles');
    generate.classList.add('est-generate');
    actions.append(stop, generate);
    root.append(status, actions);

    const popup = new context.Popup(root, context.POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        okButton: t('cancel'),
        cancelButton: false,
        onClosing: () => !root.classList.contains('est-dialog--busy'),
    });
    popup.dlg?.setAttribute('aria-labelledby', heading.id);

    stop.addEventListener('click', () => {
        stop.disabled = true;
        onCancel();
    });

    generate.addEventListener('click', async () => {
        if (!hasBrief(settings, mode, extra.value)) {
            toastr.info(t(mode === 'place' ? 'toastNoSelectionPlace' : 'toastNoSelection'), t('title'));
            return;
        }

        settings.extra = extra.value.trim();
        settings.mode = mode;
        if (mode === 'home') settings.target = boards.home.identity.value();
        else settings.placeName = boards.place.identity.read();
        contextSection.read();
        output.read();
        saveSettings();

        setBusy(root, true);
        stop.disabled = false;

        let done = false;
        try {
            done = await onGenerate(settings, {
                status: text => { status.textContent = text; },
            });
        } catch (error) {
            console.error('[Estate] generate', error);
            done = false;
        } finally {
            setBusy(root, false);
        }

        if (done) popup.complete(context.POPUP_RESULT.AFFIRMATIVE);
    });

    dialogOpen = true;
    try {
        await popup.show();
    } finally {
        dialogOpen = false;
    }
}

function addWandButton(onOpen) {
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return false;
    if (document.getElementById(WAND_ID)) return true;

    const item = node('div', 'list-group-item flex-container flexGap5 interactable');
    item.id = WAND_ID;
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.title = t('menuTitle');

    // The same mark as the dialogs and the extensions tab, rather than a Font
    // Awesome house that differs from theme to theme.
    const icon = node('div', 'extensionsMenuExtensionButton est-menu-icon');
    icon.appendChild(houseIcon());
    item.append(icon, node('span', '', t('title')));

    const activate = event => {
        if (event.type === 'keydown') {
            if (!['Enter', ' '].includes(event.key)) return;
            event.preventDefault();
            item.click();
            return;
        }
        event.preventDefault();
        closeWandMenu();
        onOpen();
    };
    item.addEventListener('click', activate);
    item.addEventListener('keydown', activate);
    menu.appendChild(item);
    return true;
}

export function mountUi(onOpen) {
    if (addWandButton(onOpen)) return;
    menuObserver = new MutationObserver(() => {
        if (!addWandButton(onOpen)) return;
        menuObserver?.disconnect();
        menuObserver = null;
    });
    menuObserver.observe(document.body, { childList: true, subtree: true });
}

export function unmountUi() {
    menuObserver?.disconnect();
    menuObserver = null;
    document.getElementById(WAND_ID)?.remove();
}
