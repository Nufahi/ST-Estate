/**
 * Estate — interface strings.
 *
 * Tag labels live in catalog.js, because those need an English prompt value
 * alongside every translation. Only chrome lives here.
 */

const STRINGS = {
    en: {
        title: 'Estate',
        menuTitle: 'Design a home or a building and write it to a lorebook',
        intro: 'Pick what the place should feel like. The model writes the description; the extension builds the lorebook entries and their keyword patterns.',

        // Tabs
        tabHome: 'Home',
        tabPlace: 'Building',
        tabHomeHint: 'Where someone lives.',
        tabPlaceHint: 'Any other building: a church, a town hall, a tavern.',

        // Target
        target: 'Whose home',
        targetChar: 'Character',
        targetPersona: 'Persona',
        targetShared: 'Shared home',
        targetHint: 'Shared means one household both of them live in.',

        // Places
        placeName: 'Name of the place',
        placeNameHint: 'Optional. Given a name, the model uses it and adds it as a keyword.',
        placeNamePlaceholder: 'The Drowned Crow',

        // Tag sections
        sectionCount: '{n} picked',
        pickOne: 'pick one',
        pickUpTo: 'up to {n}',
        clearSection: 'Clear',
        limitReached: 'Up to {n} picks in "{section}".',

        // Custom tags
        addCustom: '+ own',
        addCustomTitle: 'Add your own tag to "{section}"',
        customPrompt: 'Your tag for "{section}":',
        customRemove: 'Remove this tag',
        customFull: 'No room for more of your own tags in "{section}".',
        customEmpty: 'An empty tag cannot be added.',

        // Free-form
        extra: 'Anything else',
        extraHint: 'Written in your own words: a detail, a rule, a thing that must be there. Goes straight into the prompt.',
        extraPlaceholder: 'A wall of postcards from cities she has never visited. The kettle whistles wrong.',

        // Output
        output: 'Output',
        lorebook: 'Lorebook',
        lorebookNew: 'Create a new one',
        lorebookHint: 'Entries are appended. Nothing existing is overwritten.',
        nameTemplate: 'New lorebook name',
        nameTemplateHint: 'Placeholders: {char}, {user}, {chat}.',
        bind: 'Bind it to',
        bindChat: 'This chat',
        bindCharacter: 'The character card',
        bindPersona: 'The persona',
        bindNone: 'Nothing — just create it',
        bindHint: 'Only applies when a new lorebook is created.',
        keyLanguage: 'Keywords in',
        keyLangBoth: 'Russian + English',
        keyLangEn: 'English only',
        keyLanguageHint: 'Russian keywords are what let an entry fire in a Russian chat. English-only keeps the list short.',
        detail: 'Detail',
        detailBrief: 'Brief',
        detailNormal: 'Normal',
        detailRich: 'Rich',
        detailHint: 'Roughly {n} words per entry.',
        granularity: 'Split into',
        granularityOne: 'One entry',
        granularityRooms: 'One entry per room',
        granularityZones: 'One entry per zone',
        granularityHint: 'Per-room entries trigger only when that room comes up, so they cost less context.',
        granularityHintPlace: 'Per-zone entries trigger only when that part of the building comes up, so they cost less context.',
        languageNote: 'Entry text and visual tags are always English — only the keywords change.',

        // Model
        model: 'Model',
        modelUseCurrent: 'Use current connection',
        modelChatCompletion: 'Chat Completion',
        modelTextCompletion: 'Text Completion',
        modelHint: 'Pick a saved connection profile to generate with a different model than the one running the chat.',
        modelNoProfiles: 'No connection profiles yet. Create one in API Connections → Connection Profiles.',

        // Context
        context: 'Context to read',
        ctxCard: 'Character card',
        ctxPersona: 'Persona description',
        ctxHistory: 'Recent messages',
        ctxHistoryCount: 'How many messages',

        // Actions
        generate: 'Generate',
        cancel: 'Close',
        stop: 'Stop',
        generating: 'Writing the description…',
        retrying: 'The reply was malformed. Asking again…',

        // Preview
        previewTitle: 'Before writing',
        previewIntro: 'Check the entries. Uncheck anything you do not want, edit the text and keywords, then write them to the lorebook.',
        previewInto: 'Writing {n} of {total} into "{book}"',
        previewNewBook: 'Writing {n} of {total} into a new lorebook "{book}"',
        entryTitle: 'Title',
        entryContent: 'Text',
        entryKeys: 'Keywords',
        entryVisual: 'Visual tags',
        entryVisualHint: 'Materials, colour and light — this is what makes image prompts land.',
        keysHint: 'One per line. Regex patterns are built for you; plain words are used as-is.',
        keyStem: 'all word forms',
        keyExact: 'exact word',
        keySuffix: 'word + endings',
        keyGroup: 'synonyms, all forms',
        keyPlain: 'plain text',
        keyRejected: '{n} keyword(s) dropped as unusable.',
        noKeys: 'No keywords — this entry would never trigger.',
        write: 'Write to lorebook',
        writeBack: 'Back',
        selectAll: 'All',
        selectNone: 'None',

        // Settings card
        settingsIntro: 'Defaults for the Estate dialog.',
        settingsOpen: 'Open Estate',
        settingsHeading: 'Defaults',
        settingsNameTemplate: 'New lorebook name',
        settingsInstruction: 'Extra instruction',
        settingsInstructionDesc: 'Appended to every generation. Use it for house rules the model keeps forgetting.',
        settingsReset: 'Reset',
        settingsSaved: 'Saved.',

        // Toasts
        toastNoSelection: 'Pick at least a dwelling type or write something in "Anything else".',
        toastNoSelectionPlace: 'Pick at least a building type or write something in "Anything else".',
        toastNoApi: 'This needs a Chat Completion API or a saved connection profile.',
        toastBusy: 'Wait for the current generation to finish.',
        toastFailed: 'Generation failed. Details are in the console.',
        toastBadJson: 'The model did not return usable JSON. Try again, or switch model.',
        toastStopped: 'Stopped.',
        toastEmptyResult: 'The model returned no entries.',
        toastNothingSelected: 'Nothing is selected to write.',
        toastWritten: 'Wrote {n} entr(ies) to "{book}".',
        toastWriteFailed: 'Could not write to the lorebook. Details are in the console.',
        toastBound: 'Bound "{book}" to {target}.',
        toastBindFailed: 'The lorebook was created, but binding it failed.',
        toastCreateFailed: 'Could not create the lorebook "{book}".',
    },

    ru: {
        title: 'Estate',
        menuTitle: 'Придумать жильё или здание и записать его в лорбук',
        intro: 'Выберите, каким должно быть место. Модель напишет описание, расширение соберёт записи лорбука и ключи к ним.',

        tabHome: 'Жильё',
        tabPlace: 'Здание',
        tabHomeHint: 'Там, где кто-то живёт.',
        tabPlaceHint: 'Любое другое здание: церковь, ратуша, таверна.',

        target: 'Чьё жильё',
        targetChar: 'Персонаж',
        targetPersona: 'Персона',
        targetShared: 'Общее жильё',
        targetHint: 'Общее — это один дом, в котором живут оба.',

        placeName: 'Название места',
        placeNameHint: 'Необязательно. Если задано — модель его использует и добавит в ключи.',
        placeNamePlaceholder: 'Утопший грач',

        sectionCount: 'выбрано {n}',
        pickOne: 'один вариант',
        pickUpTo: 'до {n}',
        clearSection: 'Сбросить',
        limitReached: 'В разделе «{section}» можно выбрать не больше {n}.',

        addCustom: '+ свой',
        addCustomTitle: 'Добавить свой тег в раздел «{section}»',
        customPrompt: 'Ваш тег для раздела «{section}»:',
        customRemove: 'Удалить этот тег',
        customFull: 'В разделе «{section}» больше нет места для своих тегов.',
        customEmpty: 'Пустой тег добавить нельзя.',

        extra: 'Что ещё',
        extraHint: 'Своими словами: деталь, правило, вещь, которая обязана там быть. Уходит в промпт как есть.',
        extraPlaceholder: 'Стена открыток из городов, где она никогда не была. Чайник свистит неправильно.',

        output: 'Куда пишем',
        lorebook: 'Лорбук',
        lorebookNew: 'Создать новый',
        lorebookHint: 'Записи добавляются. Ничего существующего не перезаписывается.',
        nameTemplate: 'Имя нового лорбука',
        nameTemplateHint: 'Плейсхолдеры: {char}, {user}, {chat}.',
        bind: 'Привязать к',
        bindChat: 'Этому чату',
        bindCharacter: 'Карточке персонажа',
        bindPersona: 'Персоне',
        bindNone: 'Ни к чему — просто создать',
        bindHint: 'Работает только при создании нового лорбука.',
        keyLanguage: 'Язык ключей',
        keyLangBoth: 'Русские + английские',
        keyLangEn: 'Только английские',
        keyLanguageHint: 'Русские ключи — то, из-за чего запись вообще срабатывает в русском чате. Только английские — список короче.',
        detail: 'Детальность',
        detailBrief: 'Кратко',
        detailNormal: 'Обычно',
        detailRich: 'Подробно',
        detailHint: 'Примерно {n} слов на запись.',
        granularity: 'Разбить на',
        granularityOne: 'Одну запись',
        granularityRooms: 'Запись на комнату',
        granularityZones: 'Запись на зону',
        granularityHint: 'Покомнатные записи срабатывают только когда речь заходит об этой комнате — контекста тратят меньше.',
        granularityHintPlace: 'Позонные записи срабатывают только когда речь заходит об этой части здания — контекста тратят меньше.',
        languageNote: 'Текст записи и визуальные теги всегда английские — меняются только ключи.',

        model: 'Модель',
        modelUseCurrent: 'Текущее подключение',
        modelChatCompletion: 'Chat Completion',
        modelTextCompletion: 'Text Completion',
        modelHint: 'Выберите сохранённый профиль подключения, чтобы генерировать другой моделью, а не той, что ведёт чат.',
        modelNoProfiles: 'Профилей подключения пока нет. Создайте его в API Connections → Connection Profiles.',

        context: 'Что учитывать',
        ctxCard: 'Карточку персонажа',
        ctxPersona: 'Описание персоны',
        ctxHistory: 'Последние сообщения',
        ctxHistoryCount: 'Сколько сообщений',

        generate: 'Сгенерировать',
        cancel: 'Закрыть',
        stop: 'Стоп',
        generating: 'Пишу описание…',
        retrying: 'Ответ пришёл кривой. Спрашиваю ещё раз…',

        previewTitle: 'Перед записью',
        previewIntro: 'Проверьте записи. Снимите галочки с лишних, поправьте текст и ключи — потом пишите в лорбук.',
        previewInto: 'Запишем {n} из {total} в «{book}»',
        previewNewBook: 'Запишем {n} из {total} в новый лорбук «{book}»',
        entryTitle: 'Заголовок',
        entryContent: 'Текст',
        entryKeys: 'Ключи',
        entryVisual: 'Визуальные теги',
        entryVisualHint: 'Материалы, цвет и свет — именно из-за них картинки перестают быть клоповником.',
        keysHint: 'По одному на строку. Регексы собираются автоматически, обычные слова идут как есть.',
        keyStem: 'все формы слова',
        keyExact: 'точное слово',
        keySuffix: 'слово с окончаниями',
        keyGroup: 'синонимы, все формы',
        keyPlain: 'обычный текст',
        keyRejected: 'Отброшено негодных ключей: {n}.',
        noKeys: 'Ключей нет — запись никогда не сработает.',
        write: 'Записать в лорбук',
        writeBack: 'Назад',
        selectAll: 'Все',
        selectNone: 'Снять',

        settingsIntro: 'Значения по умолчанию для окна Estate.',
        settingsOpen: 'Открыть Estate',
        settingsHeading: 'По умолчанию',
        settingsNameTemplate: 'Имя нового лорбука',
        settingsInstruction: 'Доп. инструкция',
        settingsInstructionDesc: 'Добавляется к каждой генерации. Сюда — правила, которые модель упорно забывает.',
        settingsReset: 'Сбросить',
        settingsSaved: 'Сохранено.',

        toastNoSelection: 'Выберите хотя бы тип жилья или напишите что-нибудь в «Что ещё».',
        toastNoSelectionPlace: 'Выберите хотя бы тип здания или напишите что-нибудь в «Что ещё».',
        toastNoApi: 'Нужен Chat Completion API или сохранённый профиль подключения.',
        toastBusy: 'Дождитесь окончания текущей генерации.',
        toastFailed: 'Генерация не удалась. Подробности в консоли.',
        toastBadJson: 'Модель не вернула пригодный JSON. Попробуйте ещё раз или смените модель.',
        toastStopped: 'Остановлено.',
        toastEmptyResult: 'Модель не вернула ни одной записи.',
        toastNothingSelected: 'Нечего записывать — ничего не выбрано.',
        toastWritten: 'Записей добавлено в «{book}»: {n}.',
        toastWriteFailed: 'Не удалось записать в лорбук. Подробности в консоли.',
        toastBound: 'Лорбук «{book}» привязан: {target}.',
        toastBindFailed: 'Лорбук создан, но привязать его не вышло.',
        toastCreateFailed: 'Не удалось создать лорбук «{book}».',
    },
};

/** @returns {'en'|'ru'} the language the interface should speak. */
export function language() {
    try {
        const locale = SillyTavern.getContext().getCurrentLocale?.() || navigator.language || 'en';
        return String(locale).toLowerCase().startsWith('ru') ? 'ru' : 'en';
    } catch {
        return 'en';
    }
}

/**
 * Look up an interface string, interpolating `{name}` placeholders.
 *
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 * @returns {string}
 */
export function t(key, vars = {}) {
    let value = STRINGS[language()][key] ?? STRINGS.en[key] ?? key;
    for (const [name, replacement] of Object.entries(vars)) {
        value = value.replaceAll(`{${name}}`, String(replacement));
    }
    return value;
}
