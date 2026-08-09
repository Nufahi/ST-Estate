/**
 * Estate for SillyTavern — entry point.
 *
 * Flow: pick tags → generate JSON → review and edit → write lorebook entries.
 */

import { is_send_press } from '/script.js';
import { paintIcons } from './icon.js';
import { t } from './i18n.js';
import { buildRequest, extractJson, normalizeEntries } from './prompt.js';
import { openPreview } from './preview.js';
import { buildLorebookName, DEPTH, ORDER, readBoundLore, writeEntries } from './lorebook.js';
import { defaultNameTemplate, defaultSectionState, getSettings, resolveProfileId, saveBrief, saveSettings } from './settings.js';
import { mountUi, openDialog, unmountUi } from './ui.js';

const EXT_PATH = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const TAG = 'Estate';
const SETTINGS_SELECTOR = '.estate-settings';

/** i18n keys naming each binding target, for the confirmation toast. */
const BIND_LABEL = Object.freeze({
    chat: 'bindChat',
    character: 'bindCharacter',
    persona: 'bindPersona',
    none: 'bindNone',
});

let inFlight = false;
let activeAbort = null;
let activeUsesProfile = false;

const warn = (scope, error) => console.warn(`[${TAG}] ${scope}`, error);

/** Aborts and cancellations arrive under several names; treat them alike. */
function isCancellation(error) {
    for (let current = error, depth = 0; current && depth < 5; current = current.cause, depth++) {
        if (current.name === 'AbortError') return true;
        if (/cancel|abort|stop/i.test(String(current.message || current || ''))) return true;
    }
    return false;
}

function cancelGeneration() {
    if (!inFlight) return false;
    activeAbort?.abort(new DOMException('Cancelled by user', 'AbortError'));
    if (!activeUsesProfile) SillyTavern.getContext().stopGeneration?.();
    return true;
}

async function generateViaMainApi(ctx, request) {
    return String(await ctx.generateRaw({
        prompt: request.prompt,
        responseLength: request.responseLength,
        trimNames: false,
    }) || '');
}

async function generateViaProfile(ctx, profileId, request, signal) {
    const service = ctx.ConnectionManagerRequestService;
    if (!service) throw new Error('Connection Manager is not available.');
    const result = await service.sendRequest(profileId, request.prompt, request.responseLength, {
        stream: false,
        extractData: true,
        includePreset: true,
        signal,
    });
    signal.throwIfAborted();
    return String(result?.content || '');
}

async function runGeneration(ctx, settings, profileId, options) {
    const request = buildRequest(settings, options);
    const reply = profileId
        ? await generateViaProfile(ctx, profileId, request, activeAbort.signal)
        : await generateViaMainApi(ctx, request);
    return { reply, request };
}

/**
 * Who the entries belong to, for the badge in each title. Resolved once per
 * run so a switch mid-generation cannot mislabel half the batch.
 *
 * A home carries no name: the badge distinguishes the character's place from
 * the user's from the shared one, which is all a title needs to say. A
 * building carries its own name, because two of them can sit in one lorebook.
 */
function resolveOrigin(brief) {
    const mode = brief.mode === 'place' ? 'place' : 'home';
    if (mode === 'place') {
        return { mode, target: 'place', place: String(brief.placeName || '').trim() };
    }
    return { mode, target: brief.target, place: '' };
}

/**
 * Give each draft entry its ordering tier. Room entries sit just under the
 * whole-home entry so the general description reads first.
 */
function applyTiers(entries) {
    return entries.map(entry => {
        const whole = !entry.room || /^whole$|^home$|^all$/i.test(entry.room);
        return {
            ...entry,
            order: whole ? ORDER.home : ORDER.room,
            depth: whole ? DEPTH.home : DEPTH.room,
        };
    });
}

/**
 * The whole flow behind the dialog's Generate button.
 *
 * @param {object} settings global preferences
 * @param {object} brief the answers belonging to this chat
 * @param {{status: (text: string) => void}} hooks
 * @returns {Promise<boolean>} true when entries were written
 */
async function generateEstate(settings, brief, hooks) {
    if (inFlight || is_send_press) {
        toastr.warning(t('toastBusy'), t('title'));
        return false;
    }

    const ctx = SillyTavern.getContext();
    const profileId = resolveProfileId(settings);
    if (!profileId && ctx.mainApi !== 'openai') {
        toastr.warning(t('toastNoApi'), t('title'));
        return false;
    }

    inFlight = true;
    activeAbort = new AbortController();
    activeUsesProfile = !!profileId;

    // The prompt builder wants one object. The stores are merged here rather
    // than in prompt.js, so the split stays a storage concern and nothing
    // downstream of it has to know there are two.
    const request = { ...settings, ...brief };

    try {
        // The names are handed to the parser so an owner the model wrote into a
        // title can be taken back out: the badge says whose place it is, and
        // saying it again on every row is what crowded the lorebook list.
        //
        // Homes only. A building can legitimately be called "Anna's Rest", and
        // stripping the name out of that leaves an entry titled "Rest".
        const parseOptions = {
            englishOnly: settings.keyLanguage === 'en',
            names: brief.mode === 'place'
                ? []
                : [ctx.name2, ctx.name1].map(name => String(name || '').trim()).filter(Boolean),
        };

        // Read once, before the first request, so the retry pass sees the same
        // material and a mid-run lorebook edit cannot change the brief.
        let lore = '';
        if (settings.useLore) {
            try {
                lore = await readBoundLore();
            } catch (error) {
                warn('lorebook context', error);
            }
        }

        let attempt = await runGeneration(ctx, request, profileId, { lore });
        let parsed = extractJson(attempt.reply);
        let normalized = parsed.ok ? normalizeEntries(parsed.value, parseOptions) : { ok: false, error: parsed.error };

        // A reply can parse cleanly and still be useless: entries whose keyword
        // list came back empty never fire once written. Worth another pass.
        const repairReason = normalized.ok
            ? (normalized.keyless ? `${normalized.keyless} entr(ies) came back with an empty "keys" array` : '')
            : normalized.error;

        if (repairReason) {
            warn('first pass unusable', repairReason);
            hooks.status(t(normalized.ok ? 'retryingKeys' : 'retrying'));
            activeAbort.signal.throwIfAborted();

            const retry = await runGeneration(ctx, request, profileId, { repair: repairReason, lore });
            const retryParsed = extractJson(retry.reply);
            const retryNormalized = retryParsed.ok
                ? normalizeEntries(retryParsed.value, parseOptions)
                : { ok: false, error: retryParsed.error };

            // Only take the retry when it is genuinely better: a second pass
            // that parses but loses the keys again should not replace a first
            // pass that at least had some.
            if (retryNormalized.ok && (!normalized.ok || retryNormalized.keyless < normalized.keyless)) {
                attempt = retry;
                normalized = retryNormalized;
            }
        }

        if (!normalized.ok) {
            warn('unusable reply', normalized.error);
            console.debug(`[${TAG}] raw reply:`, attempt.reply);
            toastr.error(t('toastBadJson'), t('title'));
            return false;
        }

        if (normalized.keyless) {
            warn('entries without keywords', normalized.keyless);
            toastr.warning(t('toastKeyless', { n: normalized.keyless }), t('title'));
        }

        const entries = applyTiers(normalized.entries);
        if (!entries.length) {
            toastr.info(t('toastEmptyResult'), t('title'));
            return false;
        }

        const isNew = brief.createNew || !brief.lorebookName;
        const book = isNew ? buildLorebookName(settings.nameTemplate) : brief.lorebookName;
        const origin = resolveOrigin(brief);

        return await openPreview(entries, { book, isNew, mode: origin.mode }, async selected => {
            try {
                const result = await writeEntries(selected, {
                    name: book,
                    create: isNew,
                    bind: settings.bind,
                    origin,
                });

                toastr.success(t('toastWritten', { n: result.written, book: result.name }), t('title'));
                if (result.bound) {
                    toastr.info(t('toastBound', { book: result.name, target: t(BIND_LABEL[settings.bind]) }), t('title'));
                }
                if (result.bindFailed) toastr.warning(t('toastBindFailed'), t('title'));

                // A freshly created book becomes this chat's target next time.
                if (isNew) {
                    brief.createNew = false;
                    brief.lorebookName = result.name;
                    saveBrief();
                }
                return true;
            } catch (error) {
                console.error(`[${TAG}] write failed`, error);
                toastr.error(
                    error?.code === 'createFailed'
                        ? t('toastCreateFailed', { book: error.book })
                        : t('toastWriteFailed'),
                    t('title'),
                );
                return false;
            }
        });
    } catch (error) {
        if (isCancellation(error)) {
            toastr.info(t('toastStopped'), t('title'));
            return false;
        }
        warn('generate', error);
        toastr.error(t('toastFailed'), t('title'));
        return false;
    } finally {
        inFlight = false;
        activeAbort = null;
        activeUsesProfile = false;
    }
}

// ---------------------------------------------------------------------------
// Settings card
// ---------------------------------------------------------------------------

function bindSettingsUi(open) {
    const settings = getSettings();
    const root = document.querySelector(SETTINGS_SELECTOR);
    if (!root) return;

    for (const element of root.querySelectorAll('[data-estate-i18n]')) {
        element.textContent = t(element.dataset.estateI18n);
    }
    paintIcons(root);

    const nameTemplate = /** @type {HTMLInputElement} */ (root.querySelector('#estate_name_template'));
    const instruction = /** @type {HTMLTextAreaElement} */ (root.querySelector('#estate_instruction'));
    const sectionState = /** @type {HTMLSelectElement} */ (root.querySelector('#estate_section_state'));
    const reset = root.querySelector('#estate_reset');
    const saved = root.querySelector('#estate_saved');
    if (!nameTemplate || !instruction || !sectionState || !reset) return;

    root.querySelector('#estate_open')?.addEventListener('click', () => open());

    // The save itself is instant; this only reassures, so it never blocks.
    let hideTimer = null;
    const flashSaved = () => {
        if (!saved) return;
        saved.classList.add('estate-settings__saved--on');
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => saved.classList.remove('estate-settings__saved--on'), 1600);
    };

    nameTemplate.value = settings.nameTemplate;
    nameTemplate.addEventListener('change', () => {
        settings.nameTemplate = nameTemplate.value.trim() || defaultNameTemplate();
        nameTemplate.value = settings.nameTemplate;
        saveSettings();
        flashSaved();
    });

    sectionState.value = settings.sectionState;
    sectionState.addEventListener('change', () => {
        settings.sectionState = sectionState.value;
        saveSettings();
        flashSaved();
    });

    instruction.value = settings.instruction;
    instruction.addEventListener('change', () => {
        settings.instruction = instruction.value.trim();
        saveSettings();
        flashSaved();
    });

    reset.addEventListener('click', () => {
        settings.nameTemplate = defaultNameTemplate();
        settings.sectionState = defaultSectionState();
        settings.instruction = '';
        nameTemplate.value = settings.nameTemplate;
        sectionState.value = settings.sectionState;
        instruction.value = '';
        saveSettings();
        flashSaved();
    });
}

async function mountSettings(open) {
    if (document.querySelector(SETTINGS_SELECTOR)) return;

    const response = await fetch(`${EXT_PATH}/settings.html`);
    if (!response.ok) throw new Error(`Settings template returned ${response.status}`);

    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host) throw new Error('Extensions settings container is unavailable.');

    const template = document.createElement('template');
    template.innerHTML = (await response.text()).trim();
    const block = template.content.firstElementChild;
    if (!block) throw new Error('Settings template is empty.');

    // Every extension appends its card whenever its own fetch happens to
    // return, so the column order is a race and comes out differently on each
    // reload. Estate belongs above Facets, which is a sibling extension by the
    // same hand, so it is placed rather than appended.
    const facets = host.querySelector('.facets-settings');
    if (facets) host.insertBefore(block, facets);
    else host.appendChild(block);

    bindSettingsUi(open);
}

// ---------------------------------------------------------------------------
// Slash command
// ---------------------------------------------------------------------------

function registerSlashCommand(open) {
    try {
        const ctx = SillyTavern.getContext();
        const { SlashCommandParser, SlashCommand } = ctx;
        if (!SlashCommandParser || !SlashCommand) return;

        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'estate',
            helpString: 'Open the Estate dialog: design a home or a building and write it to a lorebook.',
            callback: async () => {
                open();
                return '';
            },
        }));
    } catch (error) {
        warn('slash command', error);
    }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

jQuery(async () => {
    const open = () => openDialog(generateEstate, cancelGeneration);

    mountUi(open);
    registerSlashCommand(open);

    try {
        await mountSettings(open);
    } catch (error) {
        warn('settings', error);
    }

    window.addEventListener('pagehide', unmountUi, { once: true });
    console.log(`[${TAG}] initialized.`);
});
