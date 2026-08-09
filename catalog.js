/**
 * Estate — tag catalog.
 *
 * Every tag carries an English `prompt` string, which is what the model
 * actually receives. The `en` / `ru` labels are only for the UI, so switching
 * the interface language never changes the generation result.
 */

const CHIP = (id, en, ru, prompt) => Object.freeze({ id, en, ru, prompt });

/** Dwelling type — the physical shell of the home. */
export const DWELLING = Object.freeze([
    CHIP('studio', 'Studio', 'Студия', 'a single-room studio apartment'),
    CHIP('apartment', 'Apartment', 'Квартира', 'a multi-room city apartment'),
    CHIP('loft', 'Loft', 'Лофт', 'a converted industrial loft with open floor plan'),
    CHIP('penthouse', 'Penthouse', 'Пентхаус', 'a top-floor penthouse with terrace access'),
    CHIP('communal', 'Communal flat', 'Коммуналка', 'a room in a shared communal flat'),
    CHIP('dorm', 'Dorm room', 'Общага', 'a cramped dormitory room'),
    CHIP('townhouse', 'Townhouse', 'Таунхаус', 'a narrow multi-storey townhouse'),
    CHIP('house', 'House', 'Дом', 'a detached family house'),
    CHIP('cottage', 'Cottage', 'Коттедж', 'a countryside cottage'),
    CHIP('mansion', 'Mansion', 'Особняк', 'a large private mansion'),
    CHIP('estate', 'Manor estate', 'Поместье', 'an old manor estate with grounds'),
    CHIP('cabin', 'Cabin', 'Хижина', 'a remote wooden cabin'),
    CHIP('trailer', 'Trailer', 'Трейлер', 'a lived-in trailer or mobile home'),
    CHIP('houseboat', 'Houseboat', 'Плавдом', 'a houseboat moored at a dock'),
    CHIP('bunker', 'Bunker', 'Бункер', 'a subterranean bunker habitat'),
    CHIP('capsule', 'Capsule', 'Капсула', 'a capsule micro-unit in a stacked block'),
    CHIP('barracks', 'Barracks', 'Казарма', 'a shared barracks bunk'),
    CHIP('tower_room', 'Tower room', 'Башня', 'a room in a stone tower'),
    CHIP('inn_room', 'Inn room', 'Комната в таверне', 'a rented room above an inn'),
    CHIP('shrine', 'Temple quarters', 'Келья', 'monastic quarters attached to a temple'),
    CHIP('ship_cabin', 'Ship cabin', 'Каюта', 'a cabin aboard a ship'),
    CHIP('station_pod', 'Station pod', 'Отсек станции', 'a crew pod aboard an orbital station'),
]);

/** Interior style — the design language. */
export const STYLE = Object.freeze([
    CHIP('loft_industrial', 'Industrial loft', 'Индастриал / лофт', 'industrial loft: exposed brick, raw concrete, black steel frames, visible ducts and pipework'),
    CHIP('hitech', 'Hi-tech', 'Хай-тек', 'hi-tech: glass, brushed steel, glossy lacquer, hidden storage, integrated smart panels'),
    CHIP('minimalism', 'Minimalism', 'Минимализм', 'minimalism: bare surfaces, no ornament, monochrome palette, everything concealed'),
    CHIP('scandi', 'Scandinavian', 'Скандинавский', 'scandinavian: pale ash wood, white walls, wool throws, abundant daylight'),
    CHIP('japandi', 'Japandi', 'Джапанди', 'japandi: low furniture, paper screens, tatami, muted earth tones, deliberate emptiness'),
    CHIP('wabi_sabi', 'Wabi-sabi', 'Ваби-саби', 'wabi-sabi: hand-thrown ceramics, cracked glazes, unfinished plaster, honest wear'),
    CHIP('boho', 'Boho', 'Бохо', 'boho: layered rugs, macrame, rattan, trailing plants, mismatched textiles'),
    CHIP('cottagecore', 'Cottagecore', 'Коттеджкор', 'cottagecore: floral prints, dried herbs, enamelware, quilted fabrics, worn wooden furniture'),
    CHIP('midcentury', 'Mid-century', 'Мид-сенчури', 'mid-century modern: teak veneer, tapered legs, mustard and olive upholstery, atomic motifs'),
    CHIP('artdeco', 'Art deco', 'Ар-деко', 'art deco: brass inlay, lacquered black wood, fan and sunburst motifs, velvet, geometric mirrors'),
    CHIP('victorian', 'Victorian', 'Викторианский', 'victorian: heavy drapery, dark mahogany, patterned wallpaper, porcelain, gilt frames'),
    CHIP('gothic', 'Gothic', 'Готика', 'gothic: pointed arches, wrought iron, deep shadow, stained glass, carved stone'),
    CHIP('baroque', 'Baroque', 'Барокко', 'baroque: gilded moulding, marble, oil paintings, ornate excess'),
    CHIP('brutalism', 'Brutalism', 'Брутализм', 'brutalism: board-formed concrete, monolithic mass, tiny deep-set windows'),
    CHIP('cyberpunk', 'Cyberpunk', 'Киберпанк', 'cyberpunk: neon signage bleeding through blinds, tangled cabling, cheap plastic, screen glow'),
    CHIP('solarpunk', 'Solarpunk', 'Солярпанк', 'solarpunk: living green walls, timber and glass, solar louvres, water features'),
    CHIP('steampunk', 'Steampunk', 'Стимпанк', 'steampunk: brass gauges, copper piping, leather straps, gaslight, clockwork'),
    CHIP('dieselpunk', 'Dieselpunk', 'Дизельпанк', 'dieselpunk: riveted steel, bakelite switches, oil stains, heavy machinery aesthetics'),
    CHIP('rustic', 'Rustic', 'Рустик', 'rustic: rough-hewn beams, stone hearth, iron hardware, homespun fabric'),
    CHIP('mediterranean', 'Mediterranean', 'Средиземноморский', 'mediterranean: whitewashed walls, terracotta tile, arched openings, olive wood'),
    CHIP('traditional_ru', 'Slavic traditional', 'Славянский', 'slavic traditional: carved wood, painted tile stove, embroidered linen, samovar'),
    CHIP('traditional_jp', 'Japanese traditional', 'Японский традиционный', 'japanese traditional: shoji screens, tatami mats, tokonoma alcove, low table'),
    CHIP('academia', 'Dark academia', 'Дарк академия', 'dark academia: floor-to-ceiling bookcases, green banker lamps, leather chairs, tobacco tones'),
    CHIP('kitsch', 'Maximalist kitsch', 'Китч', 'maximalist kitsch: clashing patterns, souvenir clutter, saturated colour, no restraint'),
]);

/** Wealth tier — drives material quality and clutter density. */
export const WEALTH = Object.freeze([
    CHIP('destitute', 'Destitute', 'Нищета', 'destitute: broken fixtures, damp stains, scavenged furniture, bare bulb'),
    CHIP('poor', 'Poor', 'Бедно', 'poor: chipboard furniture, patched textiles, mismatched crockery, everything repaired rather than replaced'),
    CHIP('modest', 'Modest', 'Скромно', 'modest: functional mass-market furniture, clean but plain, small comforts'),
    CHIP('comfortable', 'Comfortable', 'Достаток', 'comfortable: solid furniture, coordinated textiles, a few deliberate indulgences'),
    CHIP('affluent', 'Affluent', 'Богато', 'affluent: designer pieces, natural stone and hardwood, original art, staff-level tidiness'),
    CHIP('opulent', 'Opulent', 'Роскошь', 'opulent: bespoke everything, rare materials, gallery-grade art, conspicuous scale'),
]);

/** Condition — how the space is kept. */
export const CONDITION = Object.freeze([
    CHIP('pristine', 'Pristine', 'Идеально', 'pristine and showroom-clean, nothing out of place'),
    CHIP('tidy', 'Tidy', 'Прибрано', 'tidy and maintained, lived-in but under control'),
    CHIP('lived_in', 'Lived-in', 'Обжито', 'lived-in: small habitual messes, objects where they were last used'),
    CHIP('cluttered', 'Cluttered', 'Захламлено', 'cluttered: stacked belongings, every surface occupied, narrow walking paths'),
    CHIP('neglected', 'Neglected', 'Запущено', 'neglected: dust, unwashed dishes, things broken and left broken'),
    CHIP('derelict', 'Derelict', 'Разруха', 'derelict: peeling paint, water damage, exposed wiring, partial collapse'),
]);

/** Era / setting — anchors technology and materials. */
export const ERA = Object.freeze([
    CHIP('antiquity', 'Antiquity', 'Античность', 'classical antiquity'),
    CHIP('medieval', 'Medieval', 'Средневековье', 'medieval period'),
    CHIP('renaissance', 'Renaissance', 'Ренессанс', 'renaissance period'),
    CHIP('industrial', '19th century', 'XIX век', 'nineteenth-century industrial era'),
    CHIP('early20', 'Early 20th c.', 'Начало XX века', 'early twentieth century'),
    CHIP('soviet', 'Soviet', 'Советский', 'late-soviet era, panel housing and state-issue furniture'),
    CHIP('nineties', 'The 90s', 'Девяностые', 'the nineteen-nineties'),
    CHIP('modern', 'Present day', 'Наши дни', 'present day'),
    CHIP('nearfuture', 'Near future', 'Ближайшее будущее', 'near-future, one or two decades ahead'),
    CHIP('farfuture', 'Far future', 'Далёкое будущее', 'far-future spacefaring civilisation'),
    CHIP('postapoc', 'Post-apocalypse', 'Постапокалипсис', 'post-apocalyptic scarcity, everything salvaged'),
    CHIP('fantasy', 'Fantasy', 'Фэнтези', 'secondary-world fantasy setting'),
]);

/** Palette — feeds both prose and image prompts. */
export const PALETTE = Object.freeze([
    CHIP('warm_neutral', 'Warm neutrals', 'Тёплые нейтральные', 'warm neutrals: sand, oat, camel, warm grey'),
    CHIP('cool_neutral', 'Cool neutrals', 'Холодные нейтральные', 'cool neutrals: slate, fog, pale concrete, cold white'),
    CHIP('monochrome', 'Monochrome', 'Монохром', 'monochrome: black, white and every grey between'),
    CHIP('earth', 'Earth tones', 'Земляные', 'earth tones: terracotta, ochre, umber, moss'),
    CHIP('forest', 'Forest green', 'Лесной зелёный', 'deep forest green with brass and walnut'),
    CHIP('emerald', 'Emerald & gold', 'Изумруд и золото', 'emerald green with gold accents'),
    CHIP('burgundy', 'Burgundy', 'Бордо', 'burgundy and oxblood with dark wood'),
    CHIP('navy', 'Navy & brass', 'Синий и латунь', 'navy blue with brass and pale oak'),
    CHIP('pastel', 'Pastels', 'Пастель', 'soft pastels: powder pink, mint, butter yellow'),
    CHIP('jewel', 'Jewel tones', 'Драгоценные', 'saturated jewel tones: sapphire, ruby, amethyst'),
    CHIP('neon', 'Neon', 'Неон', 'neon accents: magenta and cyan against darkness'),
    CHIP('sepia', 'Sepia', 'Сепия', 'sepia and tobacco, everything sun-faded'),
    CHIP('bleached', 'Bleached', 'Выбеленный', 'bleached and colourless, sun-scoured surfaces'),
    CHIP('blackred', 'Black & red', 'Чёрный и красный', 'black with arterial red accents'),
]);

/** Light — the single strongest lever on how an image prompt reads. */
export const LIGHT = Object.freeze([
    CHIP('sunlit', 'Sunlit', 'Солнечно', 'flooded with direct daylight, hard window shadows'),
    CHIP('diffuse', 'Soft daylight', 'Мягкий дневной', 'soft diffuse daylight through sheer curtains'),
    CHIP('golden', 'Golden hour', 'Золотой час', 'low golden-hour sun raking across the room'),
    CHIP('overcast', 'Overcast', 'Пасмурно', 'flat overcast light, no shadows, muted colour'),
    CHIP('lamplit', 'Lamplit', 'Ламповый', 'warm pools of lamplight, dark corners between them'),
    CHIP('candlelit', 'Candlelit', 'Свечи', 'candlelight and firelight, everything flickering'),
    CHIP('fluorescent', 'Fluorescent', 'Люминесцент', 'cold fluorescent overheads, greenish cast, visible flicker'),
    CHIP('screenglow', 'Screen glow', 'Свет экранов', 'lit mainly by screens, blue-white on nearby faces'),
    CHIP('neonlit', 'Neon spill', 'Неоновая подсветка', 'neon signage bleeding through the window in stripes'),
    CHIP('dim', 'Dim', 'Полумрак', 'dim throughout, shapes read before details'),
    CHIP('dark', 'Near dark', 'Темнота', 'near darkness, only silhouettes and a single light source'),
]);

/** Rooms — what to actually describe. */
export const ROOMS = Object.freeze([
    CHIP('entry', 'Entryway', 'Прихожая', 'entryway'),
    CHIP('living', 'Living room', 'Гостиная', 'living room'),
    CHIP('kitchen', 'Kitchen', 'Кухня', 'kitchen'),
    CHIP('dining', 'Dining area', 'Столовая', 'dining area'),
    CHIP('bedroom', 'Bedroom', 'Спальня', 'bedroom'),
    CHIP('bathroom', 'Bathroom', 'Ванная', 'bathroom'),
    CHIP('study', 'Study', 'Кабинет', 'study or home office'),
    CHIP('library', 'Library', 'Библиотека', 'library'),
    CHIP('workshop', 'Workshop', 'Мастерская', 'workshop or studio'),
    CHIP('balcony', 'Balcony', 'Балкон', 'balcony or terrace'),
    CHIP('basement', 'Basement', 'Подвал', 'basement or cellar'),
    CHIP('attic', 'Attic', 'Чердак', 'attic'),
    CHIP('garden', 'Garden', 'Сад', 'garden or yard'),
    CHIP('garage', 'Garage', 'Гараж', 'garage'),
    CHIP('exterior', 'Exterior', 'Фасад', 'building exterior and approach'),
]);

/** Signature features — the memorable specifics. */
export const FEATURES = Object.freeze([
    CHIP('fireplace', 'Fireplace', 'Камин', 'a working fireplace'),
    CHIP('stove', 'Tile stove', 'Печь', 'a tiled masonry stove'),
    CHIP('bigwindows', 'Panoramic windows', 'Панорамные окна', 'floor-to-ceiling panoramic windows'),
    CHIP('skylight', 'Skylight', 'Световой люк', 'a skylight overhead'),
    CHIP('baywindow', 'Bay window', 'Эркер', 'a bay window with a seat'),
    CHIP('spiral', 'Spiral stair', 'Винтовая лестница', 'a spiral staircase'),
    CHIP('mezzanine', 'Mezzanine', 'Антресоль', 'a mezzanine sleeping level'),
    CHIP('plants', 'Many plants', 'Много растений', 'an overgrowth of houseplants'),
    CHIP('books', 'Book walls', 'Стены книг', 'walls of books, double-stacked'),
    CHIP('vinyl', 'Record player', 'Винил', 'a turntable and record collection'),
    CHIP('piano', 'Piano', 'Пианино', 'an upright piano'),
    CHIP('aquarium', 'Aquarium', 'Аквариум', 'a large lit aquarium'),
    CHIP('cat', 'A cat', 'Кот', 'a resident cat and its territory'),
    CHIP('dog', 'A dog', 'Собака', 'a resident dog and its territory'),
    CHIP('altar', 'Shrine', 'Алтарь', 'a small household shrine or altar'),
    CHIP('weapons', 'Weapon rack', 'Оружие', 'displayed or stored weapons'),
    CHIP('workbench', 'Workbench', 'Верстак', 'a cluttered workbench mid-project'),
    CHIP('rig', 'Computer rig', 'Комп', 'a multi-monitor computer setup'),
    CHIP('server', 'Server rack', 'Серверная', 'a humming server rack'),
    CHIP('lab', 'Lab bench', 'Лаборатория', 'improvised laboratory equipment'),
    CHIP('greenhouse', 'Greenhouse', 'Оранжерея', 'an attached greenhouse'),
    CHIP('bar', 'Home bar', 'Бар', 'a stocked home bar'),
    CHIP('gym', 'Home gym', 'Спортуголок', 'home training equipment'),
    CHIP('nosleep', 'No proper bed', 'Нет кровати', 'no proper bed — a mattress, sofa or bedroll instead'),
    CHIP('hidden', 'Hidden space', 'Тайник', 'a concealed room or cache'),
    CHIP('view', 'Notable view', 'Вид из окна', 'a view that defines the space'),
    CHIP('smell', 'Signature smell', 'Свой запах', 'a smell the place is known by'),
    CHIP('noise', 'Constant noise', 'Постоянный шум', 'a constant background sound'),
]);

/**
 * The full section list the housing tab renders, in order.
 * `multi` sections allow several picks; the rest are single-choice.
 */
export const SECTIONS = Object.freeze([
    Object.freeze({ id: 'dwelling', en: 'Dwelling', ru: 'Тип жилья', chips: DWELLING, multi: false }),
    Object.freeze({ id: 'style', en: 'Style', ru: 'Стиль', chips: STYLE, multi: true, max: 3 }),
    Object.freeze({ id: 'wealth', en: 'Means', ru: 'Достаток', chips: WEALTH, multi: false }),
    Object.freeze({ id: 'condition', en: 'Condition', ru: 'Состояние', chips: CONDITION, multi: false }),
    Object.freeze({ id: 'era', en: 'Era', ru: 'Эпоха', chips: ERA, multi: false }),
    Object.freeze({ id: 'palette', en: 'Palette', ru: 'Палитра', chips: PALETTE, multi: true, max: 2 }),
    Object.freeze({ id: 'light', en: 'Light', ru: 'Свет', chips: LIGHT, multi: true, max: 2 }),
    Object.freeze({ id: 'rooms', en: 'Rooms to cover', ru: 'Что описать', chips: ROOMS, multi: true, max: 8 }),
    Object.freeze({ id: 'features', en: 'Signature features', ru: 'Особенности', chips: FEATURES, multi: true, max: 8 }),
]);

const SECTION_BY_ID = new Map(SECTIONS.map(section => [section.id, section]));

/** @returns {string[]} every valid chip id of a section. */
export function chipIds(sectionId) {
    return (SECTION_BY_ID.get(sectionId)?.chips || []).map(chip => chip.id);
}

/**
 * Resolve stored selections into the English prompt fragments the model sees.
 * Unknown ids are dropped, so stale settings can never poison a prompt.
 *
 * @param {string} sectionId
 * @param {string[]} ids
 * @returns {string[]}
 */
export function promptsFor(sectionId, ids) {
    const section = SECTION_BY_ID.get(sectionId);
    if (!section || !Array.isArray(ids)) return [];
    const lookup = new Map(section.chips.map(chip => [chip.id, chip.prompt]));
    return ids.map(id => lookup.get(id)).filter(Boolean);
}

/**
 * Human-readable labels for the selected chips, in the UI language.
 *
 * @param {string} sectionId
 * @param {string[]} ids
 * @param {'en'|'ru'} lang
 * @returns {string[]}
 */
export function labelsFor(sectionId, ids, lang) {
    const section = SECTION_BY_ID.get(sectionId);
    if (!section || !Array.isArray(ids)) return [];
    const lookup = new Map(section.chips.map(chip => [chip.id, chip[lang] || chip.en]));
    return ids.map(id => lookup.get(id)).filter(Boolean);
}
