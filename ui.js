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
import { openSuggestions } from './suggest.js';
import {
    BATCH_LIMITS,
    BINDINGS,
    COVER_ITEMS_MAX,
    COVER_MAX,
    CUSTOM_TAG_MAX,
    DETAILS,
    DETAIL_WORD_LIMITS,
    GRANULARITY,
    HISTORY_LIMITS,
    KEY_LANGUAGES,
    TARGETS,
    addCustomTag,
    clampInt,
    coverList,
    customTagsFull,
    DETAIL_WORDS,
    getBrief,
    getSettings,
    hasChat,
    removeCustomTag,
    resolveProfileId,
    saveBrief,
    saveSettings,
    startsCollapsed,
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
 * Chip grid for one catalog section, wired directly to `brief.picks`.
 * Catalog chips come first, then the user's own tags, then the add control.
 *
 * The picks belong to the chat and the custom tags to the user, so this
 * writes to both stores and saves each on its own.
 */
function buildSection(section, settings, brief, lang) {
    const label = section[lang] || section.en;
    const counter = node('span', 'est-card__count');
    const limit = section.multi
        ? t('pickUpTo', { n: section.max || section.chips.length })
        : t('pickOne');

    const heading = node('span', 'est-card__meta', limit);

    // Both boards together run to several hundred tags, and every one of them
    // is a button with its own click listener. Building the lot up front is
    // what a phone cannot survive — the dialog simply never paints. A section
    // fills itself the first time it is opened instead.
    let fill = null;
    const { card: element, body, heading: headingRow, setCollapsed } = card(label, heading, {
        collapsible: true,
        collapsed: startsCollapsed(settings, brief, section.id),
        onExpand: () => fill?.(),
    });
    headingRow.appendChild(counter);

    const grid = node('div', 'est-chips');
    const chosen = new Set(brief.picks[section.id] || []);
    const buttons = new Map();

    const sync = () => {
        for (const [id, chip] of buttons) chip.setAttribute('aria-pressed', String(chosen.has(id)));
        counter.textContent = chosen.size ? t('sectionCount', { n: chosen.size }) : '';
        brief.picks[section.id] = [...chosen];
        saveBrief();
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

    const makeChip = chip => {
        const control = /** @type {HTMLButtonElement} */ (node('button', 'est-chip', chip[lang] || chip.en));
        control.type = 'button';
        control.title = chip.prompt;
        control.addEventListener('click', () => toggle(chip.id));
        control.setAttribute('aria-pressed', String(chosen.has(chip.id)));
        buttons.set(chip.id, control);
        return control;
    };

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
            // The tag leaves the user's vocabulary, so the global store is
            // written too; the pick that referred to it dies with it.
            removeCustomTag(settings, section.id, id);
            saveSettings();
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

    // Everything above only defined how a chip is made. This is where they
    // actually get built, and it runs on first expand — or immediately, if
    // the section starts open.
    let filled = false;
    fill = () => {
        if (filled) return;
        filled = true;
        const batch = document.createDocumentFragment();
        for (const chip of section.chips) batch.appendChild(makeChip(chip));
        grid.insertBefore(batch, add);
        for (const text of settings.customTags[section.id] || []) {
            addCustomChip(customId(text), text);
        }
    };

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

    // `card()` runs setCollapsed during construction, before `fill` exists,
    // so a section that starts open has to be filled here instead.
    if (!element.classList.contains('est-card--collapsed')) fill();

    sync();
    return { card: element, setCollapsed };
}

function buildTargetSection(brief, lang) {
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
        TARGETS.includes(brief.target) ? brief.target : 'character',
        id => { brief.target = id; saveBrief(); },
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
    const lore = checkbox('estate_ctx_lore', t('ctxLore'), settings.useLore);
    const history = checkbox('estate_ctx_history', t('ctxHistory'), settings.useHistory);
    grid.append(card_.row, persona.row, lore.row, history.row);

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

    body.append(grid, hint(t('ctxLoreHint')), countField);
    return {
        card: element,
        read() {
            settings.useCard = card_.input.checked;
            settings.usePersona = persona.input.checked;
            settings.useLore = lore.input.checked;
            settings.useHistory = history.input.checked;
            settings.historyCount = clampInt(count.value, HISTORY_LIMITS, settings.historyCount);
        },
    };
}

function buildOutputSection(settings, brief) {
    const { card: element, body } = card(t('output'));

    const books = listLorebooks();
    const bound = chatLorebook();
    const options = [{ value: NEW_BOOK, label: t('lorebookNew') }];
    for (const name of books) options.push({ value: name, label: name });

    // Which book this chat writes to is part of the brief; the book bound to
    // the chat is the fallback, which is right for a chat opened for the
    // first time and never wrong for one that has already answered.
    const stored = brief.createNew ? NEW_BOOK : brief.lorebookName;
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
        { id: 'custom', label: t('detailCustom') },
    ], DETAILS.includes(settings.detail) ? settings.detail : 'normal');

    // The hand-typed count. It seeds from whichever preset was last active, so
    // switching to "own" starts from the number already in force rather than
    // from a default the user has just moved away from.
    const detailWords = input('number', {
        min: DETAIL_WORD_LIMITS.min,
        max: DETAIL_WORD_LIMITS.max,
        step: 10,
        value: settings.detail === 'custom'
            ? settings.detailWords
            : DETAIL_WORDS[settings.detail] || DETAIL_WORDS.normal,
    });
    detailWords.classList.add('est-number');
    const detailWordsField = field(t('detailWords'), detailWords);

    const detailHint = hint('');
    const syncDetail = () => {
        const custom = detail.value() === 'custom';
        detailWordsField.hidden = !custom;
        detailHint.textContent = custom
            ? t('detailCustomHint', { min: DETAIL_WORD_LIMITS.min, max: DETAIL_WORD_LIMITS.max })
            : t('detailHint', { n: DETAIL_WORDS[detail.value()] });
    };
    for (const item of detail.buttons) {
        item.addEventListener('click', () => {
            // Carry the preset's number across, so "own" opens on the value
            // that was actually in effect a moment ago.
            const preset = DETAIL_WORDS[item.dataset.value];
            if (preset) detailWords.value = String(preset);
            syncDetail();
        });
    }
    syncDetail();

    const granularity = segmented([
        { id: 'single', label: t('granularityOne') },
        { id: 'rooms', label: t('granularityRooms') },
    ], GRANULARITY.includes(settings.granularity) ? settings.granularity : 'single');

    const splitLabel = granularity.buttons[1];
    const splitHint = hint('');
    const granularityField = field(t('granularity'), granularity.row);
    granularityField.appendChild(splitHint);

    // How many entries one request carries. This is the setting that decides
    // whether a big place comes back at all: a model asked for eleven rooms
    // at once truncates somewhere in the middle and the whole reply is lost,
    // where four small requests all land. Only meaningful when split by room.
    const batchSize = input('number', {
        min: BATCH_LIMITS.min,
        max: BATCH_LIMITS.max,
        step: 1,
        value: settings.entriesPerRequest,
    });
    batchSize.classList.add('est-number');
    const batchField = field(t('batchSize'), batchSize, t('batchSizeHint'));

    const syncBatch = () => {
        batchField.hidden = granularity.value() !== 'rooms';
    };
    for (const item of granularity.buttons) item.addEventListener('click', syncBatch);
    syncBatch();

    const keyLanguage = segmented([
        { id: 'both', label: t('keyLangBoth') },
        { id: 'en', label: t('keyLangEn') },
    ], KEY_LANGUAGES.includes(settings.keyLanguage) ? settings.keyLanguage : 'both');

    body.append(
        bookField,
        nameField,
        bindField,
        field(t('detail'), detail.row),
        detailHint,
        detailWordsField,
        granularityField,
        batchField,
        field(t('keyLanguage'), keyLanguage.row, t('keyLanguageHint')),
        hint(t('languageNote')),
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
            brief.createNew = creating;
            brief.lorebookName = creating ? '' : bookSelect.value;
            settings.nameTemplate = nameInput.value.trim() || settings.nameTemplate;
            settings.bind = bindSelect.value;
            settings.detail = detail.value();
            settings.detailWords = clampInt(detailWords.value, DETAIL_WORD_LIMITS, settings.detailWords);
            settings.granularity = granularity.value();
            settings.entriesPerRequest = clampInt(batchSize.value, BATCH_LIMITS, settings.entriesPerRequest);
            settings.keyLanguage = keyLanguage.value();
        },
    };
}

/** `m:ss`, which is the only resolution a wait of this length deserves. */
function formatElapsed(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** True when at least one tag on the active board or some free text is present. */
function hasBrief(brief, mode, ...freeText) {
    if (freeText.some(value => String(value || '').trim())) return true;
    return sectionsFor(mode).some(section => (brief.picks[section.id] || []).length > 0);
}

/**
 * The must-cover list.
 *
 * The tag boards say what kind of place it is, not what has to appear in the
 * text. Someone who picks "studio flat" gets whatever rooms the model felt
 * like writing about — a bed and a sitting corner, and no kitchen, no
 * bathroom. This is the list it is not allowed to skip, in the user's own
 * words, and it is enforced per item rather than as a suggestion.
 */
function buildCoverSection(brief) {
    const counter = node('span', 'est-card__count');
    const { card: element, body, heading: headingRow } = card(t('cover'), node('span', 'est-card__meta', t('coverMeta', { n: COVER_ITEMS_MAX })));
    headingRow.appendChild(counter);

    // A textarea rather than a single line: this is a list, it can run to
    // sixteen items, and a one-line field showing three of them at a time is
    // how an item gets typed twice.
    const control = textarea(2, brief.cover, t('coverPlaceholder'));
    control.maxLength = COVER_MAX;

    // The parsed list, shown back as chips. Splitting is forgiving — commas,
    // semicolons and newlines all separate — so the only way to know what the
    // model will actually be handed is to see it.
    const preview = node('div', 'est-cover__list');

    const sync = () => {
        const items = coverList(control.value);
        counter.textContent = items.length ? t('sectionCount', { n: items.length }) : '';
        preview.replaceChildren(...items.map(item => node('span', 'est-cover__item', item)));
        preview.hidden = !items.length;
    };
    control.addEventListener('input', sync);
    sync();

    body.append(control, preview, hint(t('coverHint')));
    return { card: element, read: () => control.value.trim() };
}

/** The place-name field, shown only on the places board. */
function buildPlaceNameSection(brief) {
    const { card: element, body } = card(t('placeName'));
    const control = input('text', { maxlength: 60, value: brief.placeName });
    body.append(control, hint(t('placeNameHint')));
    control.placeholder = t('placeNamePlaceholder');
    return { card: element, read: () => control.value.trim() };
}

/**
 * Open the Estate dialog.
 *
 * @param {object} run
 * @param {(settings: object, brief: object, places?: object[]) => Promise<boolean>} run.generate
 *        Resolves true when the flow finished and the dialog should close.
 * @param {(settings: object, brief: object) => Promise<object[]|null>} run.suggest
 * @param {() => boolean} run.cancel
 * @param {(listener: (state: object) => void) => () => void} run.subscribe
 *        Publishes the state of the run, which outlives this dialog.
 */
export async function openDialog(run) {
    if (dialogOpen) return;

    const context = SillyTavern.getContext();
    const settings = getSettings();
    const brief = getBrief();
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

    // Without a chat there is nowhere to keep the answers, and silently
    // discarding them at the end is worse than saying so at the start.
    if (!hasChat()) root.appendChild(node('p', 'est-warn', t('noChatWarning')));

    let mode = MODES.includes(brief.mode) ? brief.mode : 'home';

    // A board is built once and then swapped by hidden flag: rebuilding it on
    // every switch would throw away half-typed custom tags and scroll position.
    const tabs = node('div', 'est-tabs');
    const panels = node('div', 'est-panels');
    const boards = {};

    /**
     * Build one board. Called for the active tab immediately and for the other
     * one the first time it is opened: two full boards is twice the work for a
     * tab the user may never touch.
     */
    const fillPanel = (id, panel) => {
        const identity = id === 'home' ? buildTargetSection(brief, lang) : buildPlaceNameSection(brief);
        panel.appendChild(identity.card);

        // Folding nine to eleven sections by hand is worse than the scroll it
        // saves, so the board carries its own pair of controls.
        const built = [];
        const bar = node('div', 'est-foldbar');
        const expandAll = node('button', 'est-foldbar__button', t('expandAll'));
        expandAll.type = 'button';
        const collapseAll = node('button', 'est-foldbar__button', t('collapseAll'));
        collapseAll.type = 'button';
        expandAll.addEventListener('click', () => {
            for (const entry of built) entry.setCollapsed(false);
        });
        collapseAll.addEventListener('click', () => {
            for (const entry of built) entry.setCollapsed(true);
        });
        bar.append(expandAll, collapseAll);
        panel.appendChild(bar);

        for (const section of sectionsFor(id)) {
            const made = buildSection(section, settings, brief, lang);
            built.push(made);
            panel.appendChild(made.card);
        }

        return identity;
    };

    for (const id of MODES) {
        const tab = /** @type {HTMLButtonElement} */ (node('button', 'est-tab'));
        tab.type = 'button';
        tab.setAttribute('role', 'tab');
        tab.appendChild(id === 'place' ? buildingIcon('est-tab__icon') : houseIcon('est-tab__icon'));
        tab.appendChild(node('span', '', t(id === 'place' ? 'tabPlace' : 'tabHome')));
        tab.title = t(id === 'place' ? 'tabPlaceHint' : 'tabHomeHint');

        const panel = node('div', 'est-panel');
        panel.setAttribute('role', 'tabpanel');

        const board = { tab, panel, identity: null };
        board.build = () => {
            if (board.identity) return;
            board.identity = fillPanel(id, panel);
        };
        if (id === mode) board.build();

        boards[id] = board;
        tabs.appendChild(tab);
        panels.appendChild(panel);
    }

    const output = buildOutputSection(settings, brief);

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
            boards[id].build();
            mode = id;
            brief.mode = id;
            saveBrief();
            applyMode();
        });
    }

    root.append(tabs, panels);

    const cover = buildCoverSection(brief);
    root.appendChild(cover.card);

    const extraCard = card(t('extra'));
    const extra = textarea(3, brief.extra, t('extraPlaceholder'));
    extraCard.body.append(extra, hint(t('extraHint')));
    root.appendChild(extraCard.card);

    const model = buildModelSection(settings);
    const contextSection = buildContextSection(settings);
    root.append(model.card, contextSection.card, output.card);
    applyMode();

    // The progress block. A scouted run is one request per building and can
    // take minutes, and a dialog that only says "writing…" is indistinguishable
    // from one that has quietly died — hence the clock, the step counter and an
    // explicit way out.
    const status = node('div', 'est-status');
    status.hidden = true;
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    const statusLine = node('div', 'est-status__line');
    const spinner = node('i', 'fa-solid fa-spinner fa-spin est-status__spinner');
    spinner.setAttribute('aria-hidden', 'true');
    const statusText = node('span', 'est-status__text', t('generating'));
    const clock = node('span', 'est-status__clock', '0:00');
    statusLine.append(spinner, statusText, clock);

    const statusStep = node('span', 'est-status__step');
    const statusNote = node('p', 'est-status__note', t('backgroundHint'));
    status.append(statusLine, statusStep, statusNote);

    const actions = node('div', 'est-actions');
    const stop = button(t('stop'), 'fa-solid fa-stop');
    stop.classList.add('est-stop');
    stop.hidden = true;
    const background = button(t('background'), 'fa-solid fa-arrow-right-from-bracket');
    background.classList.add('est-background');
    background.title = t('backgroundTitle');
    background.hidden = true;
    const scout = button(t('scout'), 'fa-solid fa-binoculars');
    scout.classList.add('est-scout');
    scout.title = t('scoutTitle');
    const generate = button(t('generate'), 'fa-solid fa-wand-magic-sparkles');
    generate.classList.add('est-generate');
    actions.append(stop, background, scout, generate);

    // Status and buttons ride together at the bottom of the scroller. The
    // board is long enough that a run started at the top would otherwise put
    // both the clock and the way out of reach until you scrolled back down.
    const footer = node('div', 'est-footer');
    footer.append(status, actions);
    root.append(footer);

    const popup = new context.Popup(root, context.POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        okButton: t('cancel'),
        cancelButton: false,
    });
    popup.dlg?.setAttribute('aria-labelledby', heading.id);

    // ---- progress ---------------------------------------------------------

    let ticking = null;
    let live = true;
    let state = { phase: 'idle', startedAt: 0, done: 0, total: 1, stage: '' };

    const paint = () => {
        const busy = state.phase !== 'idle';
        const generating = state.phase === 'generating';

        root.classList.toggle('est-dialog--busy', busy);
        status.hidden = !busy;

        // Generate and Stop take turns rather than sitting side by side: only
        // one of them is ever the thing to press, and a greyed-out Generate
        // next to a live Stop is just a button asking to be clicked at.
        generate.hidden = busy;
        generate.disabled = busy;
        scout.hidden = busy;
        scout.disabled = busy;
        stop.hidden = !generating;
        background.hidden = !generating;

        if (!busy) return;

        statusText.textContent = state.stage || t(generating ? 'generating' : 'reviewing');
        clock.hidden = !generating;
        clock.textContent = generating ? formatElapsed(Date.now() - state.startedAt) : '';

        // A one-request run has no meaningful step count, so it gets no line.
        const stepped = generating && state.total > 1;
        statusStep.hidden = !stepped;
        if (stepped) {
            statusStep.textContent = t('generatingStep', {
                n: Math.min(state.done + 1, state.total),
                total: state.total,
            });
        }
    };

    const stopTicking = () => {
        clearInterval(ticking);
        ticking = null;
    };

    const unsubscribe = run.subscribe(next => {
        state = next;
        if (state.phase === 'generating' && !ticking) ticking = setInterval(paint, 1000);
        if (state.phase !== 'generating') stopTicking();
        // Reopening mid-run has to find the Stop button usable again.
        if (state.phase === 'generating') stop.disabled = false;
        paint();
    });

    stop.addEventListener('click', () => {
        stop.disabled = true;
        run.cancel();
    });

    // Leaving is not cancelling. The run carries on, and the review popup
    // appears on its own when the model is done.
    background.addEventListener('click', () => {
        toastr.info(t('toastBackground'), t('title'));
        popup.complete(context.POPUP_RESULT.CANCELLED);
    });

    /** Save whatever the board is holding, before anything is sent. */
    const commitBoard = () => {
        brief.extra = extra.value.trim();
        brief.cover = cover.read();
        brief.mode = mode;
        if (mode === 'home') brief.target = boards.home.identity.value();
        else brief.placeName = boards.place.identity.read();
        contextSection.read();
        output.read();
        saveSettings();
        saveBrief();
    };

    generate.addEventListener('click', async () => {
        if (!hasBrief(brief, mode, extra.value, cover.read())) {
            toastr.info(t(mode === 'place' ? 'toastNoSelectionPlace' : 'toastNoSelection'), t('title'));
            return;
        }

        commitBoard();
        stop.disabled = false;

        let done = false;
        try {
            done = await run.generate(settings, brief);
        } catch (error) {
            console.error('[Estate] generate', error);
            done = false;
        }

        // The dialog may already be gone: the run was sent to the background
        // while it was in flight, and completing a closed popup throws.
        if (done && live) popup.complete(context.POPUP_RESULT.AFFIRMATIVE);
    });

    // The scout needs no board at all: the whole point is that it reads the
    // story and fills the board in for you.
    scout.addEventListener('click', async () => {
        commitBoard();
        stop.disabled = false;

        let places = null;
        try {
            places = await run.suggest(settings, brief);
        } catch (error) {
            console.error('[Estate] suggest', error);
        }
        if (!places?.length) return;

        const chosen = await openSuggestions(places);
        if (!chosen?.length) return;

        let done = false;
        try {
            done = await run.generate(settings, brief, chosen);
        } catch (error) {
            console.error('[Estate] generate', error);
            done = false;
        }

        if (done && live) popup.complete(context.POPUP_RESULT.AFFIRMATIVE);
    });

    // Switching chats swaps chatMetadata underneath us, and the board is
    // still holding the old chat's brief. Every later keystroke would be
    // written to a detached object — silently lost at best, and at worst
    // saved into the wrong chat. Closing is the honest answer.
    //
    // A run in flight is left alone: it took its own copy of the brief when it
    // started, and closing the board it no longer reads would only look like a
    // cancellation that never happened.
    const eventSource = context.eventSource;
    const chatChanged = context.eventTypes?.CHAT_CHANGED || context.event_types?.CHAT_CHANGED;
    const onChatChanged = () => {
        if (state.phase !== 'idle') return;
        toastr.info(t('toastChatChanged'), t('title'));
        popup.complete(context.POPUP_RESULT.CANCELLED);
    };
    if (eventSource && chatChanged) eventSource.on(chatChanged, onChatChanged);

    dialogOpen = true;
    try {
        await popup.show();
    } finally {
        live = false;
        dialogOpen = false;
        stopTicking();
        unsubscribe();
        try {
            if (eventSource && chatChanged) eventSource.removeListener?.(chatChanged, onChatChanged);
        } catch (error) {
            console.warn('[Estate] unbind CHAT_CHANGED', error);
        }
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
