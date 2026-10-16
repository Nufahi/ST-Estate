import { button, node, textarea } from './dom.js';
import { t } from './i18n.js';
import { activation, entryIdentity } from './workflow.js';

/** Review controls shared in shape by the two independently installed extensions. */
export function installReviewTools({ root, cards, destination, existing, stamp, setBusy }) {
    const controls = node('section');
    const mode = node('select', 'text_pole');
    for (const [value, label] of [['update', 'writeUpdate'], ['variant', 'writeVariant']]) {
        const option = node('option', '', t(label));
        option.value = value;
        mode.append(option);
    }
    controls.append(node('p', '', t('writeMode')), mode);
    const sources = node('details');
    sources.append(node('summary', '', t('sourcePreview')));
    const sourceText = textarea(6, destination.source || t('noSource'));
    sourceText.readOnly = true;
    sources.append(sourceText);
    controls.append(sources);
    const sample = textarea(3, '');
    sample.placeholder = t('triggerSample');
    sample.setAttribute('aria-label', t('triggerSample'));
    const results = node('div');
    controls.append(node('p', '', t('triggerHint')), sample, results);
    root.prepend(controls);

    let busy = false;
    const refresh = () => {
        results.replaceChildren();
        for (const card of cards) {
            if (!card.enabled()) continue;
            const entry = card.read();
            const match = activation(entry, sample.value);
            results.append(node('p', '', `${match.active ? '✓' : '—'} ${entry.title}: ${t('topicMatches')} ${match.primary.join(', ') || '—'}; ${t('scopeMatches')} ${match.secondary.join(', ') || '—'}`));
        }
    };
    sample.addEventListener('input', refresh);

    for (const card of cards) {
        const initial = card.read();
        const scope = textarea(2, (initial.scopeKeys || []).join('\n'));
        scope.setAttribute('aria-label', t('scopeLabel'));
        const replace = node('select', 'text_pole');
        const auto = node('option', '', t('replaceAuto'));
        auto.value = '';
        replace.append(auto);
        for (const entry of existing) {
            const option = node('option', '', `${entry.uid}: ${entry.comment}`);
            option.value = String(entry.uid);
            replace.append(option);
        }
        const matched = existing.find(entry => entry[`${stamp}_id`] === entryIdentity(initial));
        if (matched) {
            replace.value = String(matched.uid);
            scope.value = (matched.keysecondary || []).join('\n');
        }
        const previous = textarea(5, '');
        previous.readOnly = true;
        const compare = () => {
            const old = existing.find(entry => String(entry.uid) === replace.value);
            previous.value = old?.content || '';
            previous.hidden = !old;
            replace.disabled = mode.value === 'variant';
        };
        replace.addEventListener('change', compare);
        mode.addEventListener('change', compare);
        compare();

        const read = card.read;
        card.read = () => ({
            ...read(),
            scopeKeys: scope.value.split('\n').map(value => value.trim()).filter(Boolean),
            replaceUid: replace.value || undefined,
        });
        const note = textarea(2, '');
        note.placeholder = t('revisionNote');
        note.setAttribute('aria-label', t('revisionNote'));
        const regenerate = button(t('regenerateOne'), 'fa-solid fa-rotate');
        const undo = button(t('undoRevision'), 'fa-solid fa-undo');
        undo.disabled = true;
        let backup;
        regenerate.addEventListener('click', async () => {
            if (busy || root.classList.contains('est-preview--busy')) return;
            if (!note.value.trim()) { note.focus(); return; }
            busy = true;
            setBusy(true);
            const inputs = [...root.querySelectorAll('button, input, select, textarea')];
            const disabled = inputs.map(input => input.disabled);
            inputs.forEach(input => { input.disabled = true; });
            try {
                const current = card.read();
                const result = await destination.regenerate(current, note.value.trim(), cards.filter(other => other !== card && other.enabled()).map(other => other.read()));
                backup = card.draft();
                card.apply(result);
            } catch (error) {
                console.error('Entry revision failed', error);
                toastr.error(String(error?.message || error), t('title'));
            } finally {
                inputs.forEach((input, index) => { input.disabled = disabled[index]; });
                busy = false;
                setBusy(false);
                undo.disabled = !backup;
                refresh();
            }
        });
        undo.addEventListener('click', () => {
            if (!backup || busy) return;
            card.apply(backup);
            backup = null;
            undo.disabled = true;
            refresh();
        });
        card.element.append(node('p', '', t('scopeLabel')), scope, node('p', '', t('scopeHint')),
            node('p', '', t('replaceLabel')), replace, previous, note, regenerate, undo);
        card.element.addEventListener('input', refresh);
        card.element.addEventListener('change', refresh);
    }
    return { mode: () => mode.value, busy: () => busy };
}
