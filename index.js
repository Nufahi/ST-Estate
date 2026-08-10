/**
 * Estate for SillyTavern — entry point.
 *
 * Flow: pick tags → generate JSON → review and edit → write lorebook entries.
 */

import { is_send_press } from '/script.js';
import { paintIcons } from './icon.js';
import { t } from './i18n.js';
import { buildRequest, extractJson, normalizeEntries, planChunks } from './prompt.js';
import { openPreview } from './preview.js';
import { buildLorebookName, DEPTH, ORDER, readBoundLore, writeEntries } from './lorebook.js';
import { defaultNameTemplate, defaultSectionState, getSettings, resolveProfileId, saveBrief, saveSettings } from './settings.js';
import { buildSuggestRequest, normalizeSuggestions } from './suggest.js';
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

/**
 * State of the run in progress, published rather than handed to the dialog.
 *
 * Generation outlives the dialog: closing the window has to leave the request
 * running, and reopening it has to find the run still there. That only works
 * if the progress lives here and the dialog merely subscribes to it.
 *
 * `phase` separates the halves of a run. Waiting on the model is timed and can
 * be stopped; the review popup that follows is neither, but it still holds the
 * extension busy, so a second run cannot start behind it.
 */
const runState = {
    phase: 'idle',
    startedAt: 0,
    done: 0,
    total: 1,
    stage: '',
};

/** @type {Set<(state: object) => void>} */
const runListeners = new Set();

function publish(patch = {}) {
    Object.assign(runState, patch);
    const snapshot = { ...runState };
    for (const listener of [...runListeners]) {
        try {
            listener(snapshot);
        } catch (error) {
            warn('run listener', error);
        }
    }
}

/**
 * Watch the current run. The listener is called immediately with the state as
 * it stands, so a dialog opened mid-run shows the right thing at once.
 *
 * @param {(state: {phase: string, startedAt: number, done: number, total: number, stage: string}) => void} listener
 * @returns {() => void} unsubscribe
 */
function subscribeRun(listener) {
    runListeners.add(listener);
    listener({ ...runState });
    return () => runListeners.delete(listener);
}

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
    const reply = await ctx.generateRaw({
        prompt: request.prompt,
        responseLength: request.responseLength,
        trimNames: false,
        // With a schema, SillyTavern hands back the JSON string the provider
        // was constrained to produce, rather than whatever the model felt
        // like typing around it.
        jsonSchema: request.jsonSchema || undefined,
    });
    return typeof reply === 'string' ? reply : reply ?? '';
}

async function generateViaProfile(ctx, profileId, request, signal) {
    const service = ctx.ConnectionManagerRequestService;
    if (!service) throw new Error('Connection Manager is not available.');

    // `sendRequest` forwards anything in the override payload straight into
    // the completion body, which is the only way a schema reaches a profile.
    const overrides = request.jsonSchema ? { json_schema: request.jsonSchema } : {};
    const result = await service.sendRequest(profileId, request.prompt, request.responseLength, {
        stream: false,
        extractData: true,
        includePreset: true,
        signal,
    }, overrides);
    signal.throwIfAborted();

    // A schema-constrained reply comes back parsed; everything else is text.
    const content = result?.content;
    return content && typeof content === 'object' ? content : String(content || '');
}

async function runGeneration(ctx, settings, profileId, options) {
    const request = buildRequest(settings, options);
    const reply = profileId
        ? await generateViaProfile(ctx, profileId, request, activeAbort.signal)
        : await generateViaMainApi(ctx, request);
    return { reply, request };
}

/**
 * Whether a failure is the provider refusing a structured-output request.
 *
 * Not every backend takes a schema, and the ones that do not say so in a
 * dozen different ways. Rather than keep a list of which providers support
 * what — a list that would be wrong within a month — the schema is tried and
 * the refusal is read.
 */
function isSchemaRejection(error) {
    const text = [error?.message, error?.error?.message, error?.cause?.message, error?.responseText]
        .map(value => String(value || ''))
        .join(' ')
        .toLowerCase();
    return /json_schema|json schema|response_format|structured output|schema is not supported|unsupported.*schema/.test(text);
}

/**
 * Whether the model burned its whole output allowance before answering.
 *
 * Reasoning models do this and providers report it as a hard error rather
 * than a short reply: "the output token limit was exhausted by model
 * reasoning before an answer was produced". The only useful response is to
 * ask again with a bigger ceiling, which is what the caller does with this.
 */
function isTokenLimitError(error) {
    const text = [error?.message, error?.error?.message, error?.cause?.message, error?.responseText]
        .map(value => String(value || ''))
        .join(' ')
        .toLowerCase();
    return /token limit was exhausted|exhausted by model reasoning|max_tokens|maximum.*tokens|increase max_tokens|finish_reason.*length/.test(text);
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
 * The names a title must not carry. The badge already says whose place it is,
 * and repeating it down every row is what crowded the lorebook list.
 *
 * Homes only: a building can legitimately be called "Anna's Rest", and
 * stripping the name out of that leaves an entry titled "Rest".
 */
function ownerNames(ctx, job) {
    if (job.mode === 'place') return [];
    return [ctx.name2, ctx.name1].map(name => String(name || '').trim()).filter(Boolean);
}

/**
 * One request, with the two recoveries that do not need a second opinion.
 *
 * A provider that will not take a schema is asked again without one, and a
 * model that spent its whole allowance thinking is asked again with a bigger
 * one. Neither is a failure the user should have to read about: both are the
 * same request, sent again with a setting corrected.
 *
 * @returns {Promise<{reply: string|object, request: object, noSchema: boolean}>}
 */
async function attemptGeneration(ctx, job, profileId, options) {
    let noSchema = options.noSchema === true;

    try {
        const result = await runGeneration(ctx, job, profileId, { ...options, noSchema });
        return { ...result, noSchema };
    } catch (error) {
        if (isCancellation(error)) throw error;

        if (!noSchema && isSchemaRejection(error)) {
            warn('structured output refused, retrying without a schema', error);
            noSchema = true;
            activeAbort.signal.throwIfAborted();
            const result = await runGeneration(ctx, job, profileId, { ...options, noSchema });
            return { ...result, noSchema };
        }

        if (isTokenLimitError(error) && !options.raised) {
            // The ceiling was sized for the answer and the model spent it on
            // reasoning. Raising it is the documented fix, and the only one
            // available from this side of the API. `raised` stops the retry
            // retrying itself: a model that thinks past 32k will not be
            // talked round, and the loop would only bill for the attempt.
            warn('output limit exhausted, retrying with a larger budget', error);
            publish({ stage: t('retryingBudget') });
            activeAbort.signal.throwIfAborted();
            const budget = Math.min(32768, Math.max(16384, (options.budget || 4096) * 2));
            const result = await runGeneration(ctx, job, profileId, { ...options, noSchema, budget, raised: true });
            return { ...result, noSchema };
        }

        throw error;
    }
}

/**
 * One slice of one place: a request, and when the reply is unusable, one retry.
 *
 * @returns {Promise<{ok: true, entries: object[], keyless: number} | {ok: false, error: string}>}
 */
async function generatePass(ctx, job, profileId, options) {
    const parseOptions = {
        englishOnly: job.keyLanguage === 'en',
        names: ownerNames(ctx, job),
    };

    let attempt = await attemptGeneration(ctx, job, profileId, options);
    let parsed = extractJson(attempt.reply);
    let normalized = parsed.ok ? normalizeEntries(parsed.value, parseOptions) : { ok: false, error: parsed.error };

    // A reply can parse cleanly and still be useless: entries whose keyword
    // list came back empty never fire once written. Worth another pass.
    const repairReason = normalized.ok
        ? (normalized.keyless ? `${normalized.keyless} entr(ies) came back with an empty "keys" array` : '')
        : normalized.error;

    if (repairReason) {
        warn('pass unusable', repairReason);
        publish({ stage: t(normalized.ok ? 'retryingKeys' : 'retrying') });
        activeAbort.signal.throwIfAborted();

        // The retry carries the same schema decision the first pass ended on:
        // rediscovering that a backend has no structured output, once per
        // retry, is a request spent learning what is already known.
        const retry = await attemptGeneration(ctx, job, profileId, {
            ...options,
            noSchema: attempt.noSchema,
            repair: repairReason,
            // A first pass that parsed but ran out of room gets more of it.
            budget: normalized.ok ? options.budget : Math.min(32768, (attempt.request.responseLength || 4096) + 4096),
        });
        const retryParsed = extractJson(retry.reply);
        const retryNormalized = retryParsed.ok
            ? normalizeEntries(retryParsed.value, parseOptions)
            : { ok: false, error: retryParsed.error };

        // Only take the retry when it is genuinely better: a second pass that
        // parses but loses the keys again should not replace a first pass that
        // at least had some.
        if (retryNormalized.ok && (!normalized.ok || retryNormalized.keyless < normalized.keyless)) {
            attempt = retry;
            normalized = retryNormalized;
        }
    }

    if (!normalized.ok) console.debug(`[${TAG}] raw reply:`, attempt.reply);
    return normalized;
}

/**
 * One place, written in as many requests as it takes.
 *
 * A brief split by room used to be a single request carrying eleven entries,
 * and that is what has been coming back truncated: the reply is thousands of
 * tokens of JSON and one bad character anywhere in it costs the lot. Here it
 * is a handful of small requests instead, and a batch that fails costs only
 * its own rooms.
 *
 * @returns {Promise<{entries: object[], keyless: number, failed: number, error: string}>}
 */
async function generatePlace(ctx, job, profileId, options, onProgress) {
    const chunks = planChunks(job);
    const entries = [];
    let keyless = 0;
    let failed = 0;
    let error = '';

    for (const chunk of chunks) {
        activeAbort.signal.throwIfAborted();
        onProgress?.(chunk);

        const result = await generatePass(ctx, job, profileId, { ...options, chunk });

        if (!result.ok) {
            failed++;
            error = result.error;
            warn(`batch ${chunk.index + 1}/${chunk.total} unusable`, result.error);
            continue;
        }

        entries.push(...result.entries);
        keyless += result.keyless;
    }

    return { entries, keyless, failed, error };
}

/**
 * The list of places one run will write, in the order they are generated.
 *
 * An ordinary run is a list of one: whatever the board says. A scouted run is
 * one job per building the user ticked, each carrying the tags the scout chose
 * for it laid over the board's own picks.
 *
 * @param {object} settings
 * @param {object} brief
 * @param {object[]} [places] proposals from the scout
 * @returns {object[]} jobs, each a flat settings-and-brief object
 */
function planJobs(settings, brief, places) {
    // The stores are merged here rather than in prompt.js, so the split stays
    // a storage concern and nothing downstream has to know there are two.
    const base = { ...settings, ...brief };
    if (!places?.length) return [base];

    return places.map(place => ({
        ...base,
        mode: 'place',
        placeName: place.name,
        // The scout's picks win where it had an opinion; a section it left
        // alone keeps whatever the board was already carrying.
        picks: { ...base.picks, ...place.picks },
    }));
}

/**
 * The whole flow behind the dialog's Generate button, and behind the scout's
 * "write these" button.
 *
 * Runs to completion whether or not the dialog is still open: the review step
 * is a popup of its own, so a backgrounded run still ends with the user being
 * asked what to keep.
 *
 * @param {object} settings global preferences
 * @param {object} brief the answers belonging to this chat
 * @param {object[]} [places] buildings from the scout, one request each
 * @returns {Promise<boolean>} true when entries were written
 */
async function generateEstate(settings, brief, places) {
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

    const jobs = planJobs(settings, brief, places);
    publish({ phase: 'generating', startedAt: Date.now(), done: 0, total: jobs.length, stage: '' });

    try {
        // Read once, before the first request, so every place and every retry
        // sees the same material and a mid-run lorebook edit cannot change the
        // brief halfway through.
        let lore = '';
        if (settings.useLore) {
            try {
                lore = await readBoundLore();
            } catch (error) {
                warn('lorebook context', error);
            }
        }

        const entries = [];
        let keyless = 0;
        let failures = 0;
        let partial = 0;
        let lastError = '';

        for (let index = 0; index < jobs.length; index++) {
            activeAbort.signal.throwIfAborted();

            const job = jobs[index];
            // `stage` is cleared with the step: a retry notice left over from
            // the previous place would otherwise sit there for the whole run.
            publish({ done: index, stage: '' });

            // What the caption says depends on how many things are being
            // counted. One place split into batches counts batches; several
            // places count places, and their batches would only be noise.
            const caption = chunk => {
                if (jobs.length > 1) return t('generatingPlace', { name: job.placeName });
                if (chunk.total > 1) return t('generatingBatch', { n: chunk.index + 1, total: chunk.total });
                return '';
            };

            const result = await generatePlace(ctx, job, profileId, { lore }, chunk => {
                publish({ stage: caption(chunk) });
            });

            if (!result.entries.length) {
                // One bad place out of several is not worth throwing the rest
                // away for: the buildings that did come back are still wanted.
                failures++;
                lastError = result.error;
                warn(`place ${index + 1}/${jobs.length} unusable`, result.error);
                continue;
            }

            // A place that lost a batch but kept the others is a partial
            // success, and the entries that arrived are still worth writing.
            if (result.failed) partial += result.failed;

            // The origin travels with the entry rather than with the run: one
            // review can now hold three buildings, and each row has to know
            // which of them it belongs to or every badge would say the last.
            const origin = resolveOrigin(job);
            for (const entry of applyTiers(result.entries)) entries.push({ ...entry, origin });
            keyless += result.keyless;
        }

        if (!entries.length) {
            warn('no usable entries', lastError);
            toastr.error(t(lastError ? 'toastBadJson' : 'toastEmptyResult'), t('title'));
            return false;
        }

        if (failures) toastr.warning(t('toastPlaceFailed', { n: failures, total: jobs.length }), t('title'));
        if (partial) toastr.warning(t('toastBatchFailed', { n: partial }), t('title'));

        if (keyless) {
            warn('entries without keywords', keyless);
            toastr.warning(t('toastKeyless', { n: keyless }), t('title'));
        }

        const isNew = brief.createNew || !brief.lorebookName;
        const book = isNew ? buildLorebookName(settings.nameTemplate) : brief.lorebookName;
        const mode = jobs.length > 1 ? 'place' : resolveOrigin(jobs[0]).mode;

        // The model is done; what remains is the user reading the result. The
        // Stop button has nothing left to stop from here on.
        publish({ phase: 'review', stage: '' });

        return await openPreview(entries, { book, isNew, mode }, async selected => {
            try {
                const result = await writeEntries(selected, {
                    name: book,
                    create: isNew,
                    bind: settings.bind,
                    origin: resolveOrigin(jobs[0]),
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
        publish({ phase: 'idle', stage: '', done: 0, total: 1 });
    }
}

/**
 * Ask the model which buildings this story needs. One short request, no
 * lorebook writing: what comes back is a list the user ticks, and the ticked
 * ones then go through `generateEstate` as ordinary runs.
 *
 * @param {object} settings
 * @param {object} brief
 * @returns {Promise<object[]|null>} proposals, or null when nothing came back
 */
async function suggestPlaces(settings, brief) {
    if (inFlight || is_send_press) {
        toastr.warning(t('toastBusy'), t('title'));
        return null;
    }

    const ctx = SillyTavern.getContext();
    const profileId = resolveProfileId(settings);
    if (!profileId && ctx.mainApi !== 'openai') {
        toastr.warning(t('toastNoApi'), t('title'));
        return null;
    }

    inFlight = true;
    activeAbort = new AbortController();
    activeUsesProfile = !!profileId;

    // An ordinary generating phase: one request, its own caption. Scouting is
    // not a third kind of run, and giving it a phase of its own only made
    // every place that reads one ask about two.
    publish({ phase: 'generating', startedAt: Date.now(), done: 0, total: 1, stage: t('scouting') });

    try {
        let lore = '';
        if (settings.useLore) {
            try {
                lore = await readBoundLore();
            } catch (error) {
                warn('lorebook context', error);
            }
        }

        const job = { ...settings, ...brief };
        const request = buildSuggestRequest(job, { lore, count: settings.suggestCount });

        const send = async attempt => (profileId
            ? await generateViaProfile(ctx, profileId, attempt, activeAbort.signal)
            : await generateViaMainApi(ctx, attempt));

        let reply;
        try {
            reply = await send(request);
        } catch (error) {
            if (isCancellation(error)) throw error;
            // The same two recoveries the main path makes: a backend with no
            // structured output, and a reasoning model that thought its way
            // through the entire allowance before writing a word.
            if (!isSchemaRejection(error) && !isTokenLimitError(error)) throw error;
            warn('scouting request refused, retrying plainly', error);
            activeAbort.signal.throwIfAborted();
            reply = await send({
                ...request,
                jsonSchema: null,
                responseLength: Math.min(32768, request.responseLength * 2),
            });
        }

        const parsed = extractJson(reply);
        const normalized = parsed.ok ? normalizeSuggestions(parsed.value) : { ok: false, error: parsed.error };

        if (!normalized.ok) {
            warn('scouting reply unusable', normalized.error);
            console.debug(`[${TAG}] raw reply:`, reply);
            toastr.error(t('toastNoPlacesFound'), t('title'));
            return null;
        }

        return normalized.places;
    } catch (error) {
        if (isCancellation(error)) {
            toastr.info(t('toastStopped'), t('title'));
            return null;
        }
        warn('suggest', error);
        toastr.error(t('toastFailed'), t('title'));
        return null;
    } finally {
        inFlight = false;
        activeAbort = null;
        activeUsesProfile = false;
        publish({ phase: 'idle', stage: '', done: 0, total: 1 });
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
    const open = () => openDialog({
        generate: generateEstate,
        suggest: suggestPlaces,
        cancel: cancelGeneration,
        subscribe: subscribeRun,
    });

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
