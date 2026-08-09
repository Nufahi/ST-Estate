/**
 * Estate — tag catalog.
 *
 * Every tag carries an English `prompt` string, which is what the model
 * actually receives. The `en` / `ru` labels are only for the UI, so switching
 * the interface language never changes the generation result.
 *
 * Two catalogs live here: `home` describes where someone lives, `place`
 * describes any other building. Their section ids never collide, so the two
 * tabs keep independent selections.
 */

const CHIP = (id, en, ru, prompt) => Object.freeze({ id, en, ru, prompt });

/** The two tag boards. */
export const MODES = Object.freeze(['home', 'place']);

/**
 * User-defined tags are stored under this prefix so they can never be mistaken
 * for a catalog id, and so a stale custom tag simply disappears instead of
 * silently selecting some unrelated chip.
 */
export const CUSTOM_PREFIX = 'custom:';

/** @returns {boolean} whether an id belongs to a user-defined tag. */
export function isCustomId(id) {
    return typeof id === 'string' && id.startsWith(CUSTOM_PREFIX);
}

/**
 * Build the stable id of a user-defined tag from its text. Case and inner
 * whitespace are folded so "Red Door" and "red  door" stay one tag.
 *
 * @param {string} text
 * @returns {string}
 */
export function customId(text) {
    return CUSTOM_PREFIX + String(text ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Dwelling type — the physical shell of the home. */
export const DWELLING = Object.freeze([
    CHIP('studio', 'Studio', 'Студия', 'a single-room studio apartment'),
    CHIP('apartment', 'Apartment', 'Квартира', 'a multi-room city apartment'),
    CHIP('loft', 'Loft', 'Лофт', 'a converted industrial loft with open floor plan'),
    CHIP('penthouse', 'Penthouse', 'Пентхаус', 'a top-floor penthouse with terrace access'),
    CHIP('communal', 'Communal flat', 'Коммуналка', 'a room in a shared communal flat'),
    CHIP('dorm', 'Dorm room', 'Общежитие', 'a cramped dormitory room'),
    CHIP('townhouse', 'Townhouse', 'Таунхаус', 'a narrow multi-storey townhouse'),
    CHIP('house', 'House', 'Частный дом', 'a detached family house'),
    CHIP('cottage', 'Cottage', 'Коттедж', 'a countryside cottage'),
    CHIP('mansion', 'Mansion', 'Особняк', 'a large private mansion'),
    CHIP('estate', 'Manor estate', 'Поместье', 'an old manor estate with grounds'),
    CHIP('cabin', 'Cabin', 'Хижина в глуши', 'a remote wooden cabin'),
    CHIP('trailer', 'Trailer', 'Трейлер', 'a lived-in trailer or mobile home'),
    CHIP('houseboat', 'Houseboat', 'Дом на воде', 'a houseboat moored at a dock'),
    CHIP('bunker', 'Bunker', 'Бункер', 'a subterranean bunker habitat'),
    CHIP('capsule', 'Capsule', 'Капсула', 'a capsule micro-unit in a stacked block'),
    CHIP('barracks', 'Barracks', 'Казарма', 'a shared barracks bunk'),
    CHIP('tower_room', 'Tower room', 'Комната в башне', 'a room in a stone tower'),
    CHIP('inn_room', 'Inn room', 'Комната в таверне', 'a rented room above an inn'),
    CHIP('shrine', 'Temple quarters', 'Келья при храме', 'monastic quarters attached to a temple'),
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
    CHIP('midcentury', 'Mid-century', 'Мид-сенчури, 50–60-е', 'mid-century modern: teak veneer, tapered legs, mustard and olive upholstery, atomic motifs'),
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
    CHIP('academia', 'Dark academia', 'Тёмная академия', 'dark academia: floor-to-ceiling bookcases, green banker lamps, leather chairs, tobacco tones'),
    CHIP('kitsch', 'Maximalist kitsch', 'Китч, всего побольше', 'maximalist kitsch: clashing patterns, souvenir clutter, saturated colour, no restraint'),
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
    CHIP('soviet', 'Soviet', 'Советское время', 'late-soviet era, panel housing and state-issue furniture'),
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
    CHIP('jewel', 'Jewel tones', 'Самоцветные, насыщенные', 'saturated jewel tones: sapphire, ruby, amethyst'),
    CHIP('neon', 'Neon', 'Неон', 'neon accents: magenta and cyan against darkness'),
    CHIP('sepia', 'Sepia', 'Сепия, табачные', 'sepia and tobacco, everything sun-faded'),
    CHIP('bleached', 'Bleached', 'Выцветшие, блёклые', 'bleached and colourless, sun-scoured surfaces'),
    CHIP('blackred', 'Black & red', 'Чёрный и красный', 'black with arterial red accents'),
]);

/** Light — the single strongest lever on how an image prompt reads. */
export const LIGHT = Object.freeze([
    CHIP('sunlit', 'Sunlit', 'Прямое солнце', 'flooded with direct daylight, hard window shadows'),
    CHIP('diffuse', 'Soft daylight', 'Мягкий дневной', 'soft diffuse daylight through sheer curtains'),
    CHIP('golden', 'Golden hour', 'Золотой час', 'low golden-hour sun raking across the room'),
    CHIP('overcast', 'Overcast', 'Пасмурно, без теней', 'flat overcast light, no shadows, muted colour'),
    CHIP('lamplit', 'Lamplit', 'Тёплые пятна света', 'warm pools of lamplight, dark corners between them'),
    CHIP('candlelit', 'Candlelit', 'Живой огонь, всё дрожит', 'candlelight and firelight, everything flickering'),
    CHIP('fluorescent', 'Fluorescent', 'Холодный мертвенный свет', 'cold fluorescent overheads, greenish cast, visible flicker'),
    CHIP('screenglow', 'Screen glow', 'Синеватый свет экранов', 'lit mainly by screens, blue-white on nearby faces'),
    CHIP('neonlit', 'Neon spill', 'Неон из окна', 'neon signage bleeding through the window in stripes'),
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
    CHIP('exterior', 'Exterior', 'Фасад и подход к дому', 'building exterior and approach'),
]);

/** Signature features — the memorable specifics. */
export const FEATURES = Object.freeze([
    CHIP('fireplace', 'Fireplace', 'Камин', 'a working fireplace'),
    CHIP('stove', 'Tile stove', 'Изразцовая печь', 'a tiled masonry stove'),
    CHIP('bigwindows', 'Panoramic windows', 'Панорамные окна', 'floor-to-ceiling panoramic windows'),
    CHIP('skylight', 'Skylight', 'Окно в крыше', 'a skylight overhead'),
    CHIP('baywindow', 'Bay window', 'Эркер', 'a bay window with a seat'),
    CHIP('spiral', 'Spiral stair', 'Винтовая лестница', 'a spiral staircase'),
    CHIP('mezzanine', 'Mezzanine', 'Спальный ярус, антресоль', 'a mezzanine sleeping level'),
    CHIP('plants', 'Many plants', 'Много растений', 'an overgrowth of houseplants'),
    CHIP('books', 'Book walls', 'Стены книг', 'walls of books, double-stacked'),
    CHIP('vinyl', 'Record player', 'Проигрыватель и пластинки', 'a turntable and record collection'),
    CHIP('piano', 'Piano', 'Пианино', 'an upright piano'),
    CHIP('aquarium', 'Aquarium', 'Аквариум', 'a large lit aquarium'),
    CHIP('cat', 'A cat', 'Кот', 'a resident cat and its territory'),
    CHIP('dog', 'A dog', 'Собака', 'a resident dog and its territory'),
    CHIP('altar', 'Shrine', 'Домашний алтарь', 'a small household shrine or altar'),
    CHIP('weapons', 'Weapon rack', 'Оружие на виду', 'displayed or stored weapons'),
    CHIP('workbench', 'Workbench', 'Верстак', 'a cluttered workbench mid-project'),
    CHIP('rig', 'Computer rig', 'Компьютер в несколько экранов', 'a multi-monitor computer setup'),
    CHIP('server', 'Server rack', 'Стойка с серверами', 'a humming server rack'),
    CHIP('lab', 'Lab bench', 'Самодельная лаборатория', 'improvised laboratory equipment'),
    CHIP('greenhouse', 'Greenhouse', 'Оранжерея', 'an attached greenhouse'),
    CHIP('bar', 'Home bar', 'Бар', 'a stocked home bar'),
    CHIP('gym', 'Home gym', 'Спортивный уголок', 'home training equipment'),
    CHIP('nosleep', 'No proper bed', 'Нормальной кровати нет', 'no proper bed — a mattress, sofa or bedroll instead'),
    CHIP('hidden', 'Hidden space', 'Тайная комната', 'a concealed room or cache'),
    CHIP('view', 'Notable view', 'Вид из окна', 'a view that defines the space'),
    CHIP('smell', 'Signature smell', 'Узнаваемый запах', 'a smell the place is known by'),
    CHIP('noise', 'Constant noise', 'Постоянный фоновый звук', 'a constant background sound'),
]);

/** Kind of building — the places tab equivalent of DWELLING. */
export const VENUE = Object.freeze([
    CHIP('church', 'Church', 'Церковь', 'a church or cathedral'),
    CHIP('chapel', 'Chapel', 'Часовня', 'a small roadside chapel'),
    CHIP('temple', 'Temple', 'Храм', 'a temple of a non-Christian faith'),
    CHIP('monastery', 'Monastery', 'Монастырь', 'a working monastery'),
    CHIP('townhall', 'Town hall', 'Ратуша', 'a town hall or civic council building'),
    CHIP('court', 'Courthouse', 'Суд', 'a courthouse'),
    CHIP('palace', 'Palace', 'Дворец', 'a ruler\'s palace'),
    CHIP('castle', 'Castle', 'Замок', 'a fortified castle'),
    CHIP('tavern', 'Tavern', 'Таверна', 'a tavern or public house'),
    CHIP('inn', 'Inn', 'Постоялый двор', 'an inn with rooms above the common floor'),
    CHIP('bar', 'Bar', 'Бар', 'a late-night bar'),
    CHIP('cafe', 'Cafe', 'Кафе', 'a cafe'),
    CHIP('restaurant', 'Restaurant', 'Ресторан', 'a restaurant'),
    CHIP('shop', 'Shop', 'Лавка', 'a small shop or store'),
    CHIP('market', 'Market', 'Рынок', 'a covered market or bazaar'),
    CHIP('smithy', 'Smithy', 'Кузница', 'a blacksmith\'s forge'),
    CHIP('workshop_v', 'Workshop', 'Мастерская', 'an artisan\'s workshop'),
    CHIP('library_v', 'Library', 'Библиотека', 'a public or private library'),
    CHIP('school', 'School', 'Школа', 'a school'),
    CHIP('university', 'University', 'Университет', 'a university hall'),
    CHIP('museum', 'Museum', 'Музей', 'a museum'),
    CHIP('theatre', 'Theatre', 'Театр', 'a theatre'),
    CHIP('hospital', 'Hospital', 'Больница', 'a hospital or infirmary'),
    CHIP('apothecary', 'Apothecary', 'Аптека', 'an apothecary or pharmacy'),
    CHIP('bathhouse', 'Bathhouse', 'Баня', 'a public bathhouse'),
    CHIP('barracks_v', 'Barracks', 'Казармы', 'military barracks'),
    CHIP('prison', 'Prison', 'Тюрьма', 'a prison'),
    CHIP('guardpost', 'Guard post', 'Караульная', 'a guard post or watchhouse'),
    CHIP('station', 'Station', 'Вокзал', 'a railway station'),
    CHIP('port', 'Port', 'Порт', 'a working port and its quays'),
    CHIP('warehouse', 'Warehouse', 'Склад', 'a storage warehouse'),
    CHIP('factory', 'Factory', 'Завод', 'a factory floor'),
    CHIP('mine', 'Mine', 'Шахта', 'a mine and its head works'),
    CHIP('farm', 'Farm', 'Ферма', 'a working farm'),
    CHIP('mill', 'Mill', 'Мельница', 'a mill'),
    CHIP('lighthouse', 'Lighthouse', 'Маяк', 'a lighthouse'),
    CHIP('observatory', 'Observatory', 'Обсерватория', 'an observatory'),
    CHIP('lab_v', 'Laboratory', 'Лаборатория', 'a research laboratory'),
    CHIP('office', 'Office', 'Офис', 'a corporate office floor'),
    CHIP('bank', 'Bank', 'Банк', 'a bank'),
    CHIP('brothel', 'Brothel', 'Бордель', 'a brothel'),
    CHIP('arena', 'Arena', 'Арена', 'a fighting arena'),
    CHIP('cemetery', 'Cemetery', 'Кладбище', 'a cemetery and its gatehouse'),
    CHIP('ruin', 'Ruin', 'Руины', 'the ruin of a building nobody maintains'),
]);

/** How large the place is — changes how it must be described. */
export const SCALE = Object.freeze([
    CHIP('cramped', 'Cramped', 'Тесное', 'cramped: one room, everything within arm\'s reach'),
    CHIP('modest_s', 'Modest', 'Небольшое', 'modest: a handful of rooms, takes a minute to cross'),
    CHIP('large', 'Large', 'Большое', 'large: several floors or wings, easy to lose someone in'),
    CHIP('vast', 'Vast', 'Огромное', 'vast: monumental scale, the far end is out of sight'),
    CHIP('labyrinth', 'Labyrinthine', 'Лабиринт', 'labyrinthine: nobody knows the whole plan, including the staff'),
]);

/** How busy it is — the single strongest lever on how a place feels. */
export const BUSY = Object.freeze([
    CHIP('abandoned', 'Abandoned', 'Заброшено', 'abandoned: nobody has been here in a long time'),
    CHIP('empty', 'Empty', 'Пусто', 'empty right now, though clearly still in use'),
    CHIP('quiet', 'Quiet', 'Тихо', 'quiet: a few people, voices kept low'),
    CHIP('working', 'Working', 'Рабочий день', 'a normal working day, steady traffic of people'),
    CHIP('crowded', 'Crowded', 'Людно', 'crowded: full, loud, you queue for everything'),
    CHIP('heaving', 'Heaving', 'Битком', 'heaving: shoulder to shoulder, barely passable'),
]);

/** Zones — the places-tab equivalent of ROOMS. */
export const ZONES = Object.freeze([
    CHIP('approach', 'Approach', 'Улица перед входом', 'the approach and the street outside'),
    CHIP('facade', 'Facade', 'Фасад', 'the facade and the entrance'),
    CHIP('threshold', 'Entrance hall', 'Вестибюль, тамбур', 'the entrance hall or porch'),
    CHIP('main', 'Main hall', 'Главный зал', 'the main hall — the room the building exists for'),
    CHIP('counter', 'Counter', 'Стойка или ресепшн', 'the counter, bar or reception'),
    CHIP('seating', 'Seating', 'Зал для посетителей', 'where people sit and stay'),
    CHIP('backroom', 'Back room', 'Подсобка', 'the back room the public does not see'),
    CHIP('kitchen_z', 'Kitchen', 'Кухня', 'the kitchen or preparation area'),
    CHIP('storage', 'Storage', 'Кладовая', 'storage, stockroom or pantry'),
    CHIP('cellar', 'Cellar', 'Погреб', 'the cellar or undercroft'),
    CHIP('upstairs', 'Upper floor', 'Верхний этаж', 'the upper floor'),
    CHIP('office_z', 'Office', 'Кабинет', 'the office of whoever runs the place'),
    CHIP('quarters', 'Private quarters', 'Жильё при заведении', 'the private quarters of those who live on site'),
    CHIP('yard', 'Yard', 'Двор', 'the yard, garden or grounds'),
    CHIP('roof', 'Roof', 'Крыша', 'the roof and what can be seen from it'),
    CHIP('hidden_z', 'Hidden part', 'Скрытая часть', 'the part of the building that is kept from visitors'),
]);

/** Who runs the place and how it sits in the world. */
export const ROLE = Object.freeze([
    CHIP('public', 'Open to all', 'Открыто всем', 'open to the public, anyone may walk in'),
    CHIP('members', 'Members only', 'Только для своих', 'members only, strangers are noticed at once'),
    CHIP('official', 'Official', 'Официальное', 'an official institution with rules and paperwork'),
    CHIP('sacred', 'Sacred', 'Священное', 'a sacred place with observances people keep'),
    CHIP('criminal', 'Criminal', 'Криминал', 'a front for criminal business'),
    CHIP('failing', 'Failing', 'Приходит в упадок', 'failing: fewer visitors every year, debts mounting'),
    CHIP('thriving', 'Thriving', 'Процветает', 'thriving: money coming in, recently expanded'),
    CHIP('contested', 'Contested', 'Делят двое, оба здесь', 'contested: two parties claim it and both are present'),
    CHIP('landmark', 'Landmark', 'Достопримечательность', 'a landmark everyone in the area navigates by'),
    CHIP('forgotten', 'Forgotten', 'Забытое', 'forgotten: on no map, remembered by few'),
]);

/** Signature details specific to buildings rather than homes. */
export const VENUE_FEATURES = Object.freeze([
    CHIP('bells', 'Bells', 'Колокола', 'bells that mark the hours'),
    CHIP('organ', 'Organ', 'Орган', 'a pipe organ'),
    CHIP('stainedglass', 'Stained glass', 'Витражи', 'stained glass windows'),
    CHIP('vaults', 'Vaulted ceiling', 'Своды', 'a high vaulted ceiling'),
    CHIP('columns', 'Columns', 'Колонны', 'a colonnade of stone columns'),
    CHIP('frescoes', 'Frescoes', 'Фрески', 'frescoes or murals on the walls'),
    CHIP('statue', 'Statue', 'Статуя', 'a statue that dominates the space'),
    CHIP('clock', 'Clock', 'Часы', 'a large public clock'),
    CHIP('hearth_v', 'Great hearth', 'Большой открытый очаг', 'a great open hearth'),
    CHIP('longbar', 'Long bar', 'Барная стойка', 'a long bar worn smooth by elbows'),
    CHIP('stage', 'Stage', 'Сцена', 'a stage or performance platform'),
    CHIP('gallery', 'Gallery', 'Галерея', 'an upper gallery overlooking the main floor'),
    CHIP('crypt', 'Crypt', 'Крипта', 'a crypt beneath the floor'),
    CHIP('well', 'Well', 'Колодец', 'a well or fountain'),
    CHIP('archive', 'Archive', 'Архив, полки с бумагами', 'shelves of records and ledgers'),
    CHIP('cells', 'Cells', 'Камеры', 'holding cells'),
    CHIP('machinery', 'Machinery', 'Работающие механизмы', 'working machinery nobody can talk over'),
    CHIP('notice', 'Notice board', 'Доска объявлений', 'a notice board people actually read'),
    CHIP('guards', 'Guards', 'Охрана', 'guards posted at the door'),
    CHIP('animals', 'Animals', 'Животные', 'animals kept on the premises'),
    CHIP('smell_v', 'Signature smell', 'Узнаваемый запах', 'a smell the building is known by'),
    CHIP('noise_v', 'Constant noise', 'Постоянный фоновый звук', 'a constant background sound'),
    CHIP('damage', 'Old damage', 'Следы давней беды', 'damage from an event everyone still remembers'),
    CHIP('secretway', 'Secret way', 'Тайный ход', 'a way in or out that is not on any plan'),
]);

/**
 * The housing board, in render order.
 * `multi` sections allow several picks; the rest are single-choice.
 */
export const HOME_SECTIONS = Object.freeze([
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

/**
 * The places board. Style, era, palette, light and condition are shared with
 * housing but kept under their own ids, so picking a palette for a tavern
 * never disturbs the one chosen for someone's flat.
 */
export const PLACE_SECTIONS = Object.freeze([
    Object.freeze({ id: 'venue', en: 'Building', ru: 'Тип здания', chips: VENUE, multi: false }),
    Object.freeze({ id: 'venue_role', en: 'Standing', ru: 'Положение', chips: ROLE, multi: true, max: 3 }),
    Object.freeze({ id: 'venue_scale', en: 'Scale', ru: 'Масштаб', chips: SCALE, multi: false }),
    Object.freeze({ id: 'venue_busy', en: 'How busy', ru: 'Людность', chips: BUSY, multi: false }),
    Object.freeze({ id: 'venue_style', en: 'Style', ru: 'Стиль', chips: STYLE, multi: true, max: 3 }),
    Object.freeze({ id: 'venue_condition', en: 'Condition', ru: 'Состояние', chips: CONDITION, multi: false }),
    Object.freeze({ id: 'venue_era', en: 'Era', ru: 'Эпоха', chips: ERA, multi: false }),
    Object.freeze({ id: 'venue_palette', en: 'Palette', ru: 'Палитра', chips: PALETTE, multi: true, max: 2 }),
    Object.freeze({ id: 'venue_light', en: 'Light', ru: 'Свет', chips: LIGHT, multi: true, max: 2 }),
    Object.freeze({ id: 'zones', en: 'Zones to cover', ru: 'Что описать', chips: ZONES, multi: true, max: 8 }),
    Object.freeze({ id: 'venue_features', en: 'Signature features', ru: 'Особенности', chips: VENUE_FEATURES, multi: true, max: 8 }),
]);

/** @type {Readonly<Record<'home'|'place', ReadonlyArray<object>>>} */
export const BOARDS = Object.freeze({ home: HOME_SECTIONS, place: PLACE_SECTIONS });

/** Which section holds the per-entry subdivisions, per board. */
export const SPLIT_SECTION = Object.freeze({ home: 'rooms', place: 'zones' });

/** Every section across both boards, which is what settings sanitising walks. */
export const SECTIONS = Object.freeze([...HOME_SECTIONS, ...PLACE_SECTIONS]);

const SECTION_BY_ID = new Map(SECTIONS.map(section => [section.id, section]));

/**
 * @param {'home'|'place'} mode
 * @returns {ReadonlyArray<object>} the sections that board renders.
 */
export function sectionsFor(mode) {
    return BOARDS[mode] || HOME_SECTIONS;
}

/** @returns {object|undefined} one section by id, from either board. */
export function sectionById(sectionId) {
    return SECTION_BY_ID.get(sectionId);
}

/** @returns {boolean} whether a section accepts user-defined tags. */
export function allowsCustom(sectionId) {
    return SECTION_BY_ID.has(sectionId);
}

/** @returns {string[]} every valid catalog chip id of a section. */
export function chipIds(sectionId) {
    return (SECTION_BY_ID.get(sectionId)?.chips || []).map(chip => chip.id);
}

/**
 * The text a user-defined tag contributes, recovered from its id. Custom tags
 * carry no separate prompt: what the user typed is what the model receives.
 *
 * @param {string} id
 * @param {Record<string, string>} [labels] original casing, keyed by id
 * @returns {string}
 */
function customText(id, labels = {}) {
    return labels[id] || id.slice(CUSTOM_PREFIX.length);
}

/**
 * Resolve stored selections into the English prompt fragments the model sees.
 * Unknown ids are dropped, so stale settings can never poison a prompt.
 *
 * @param {string} sectionId
 * @param {string[]} ids
 * @param {Record<string, string>} [customLabels]
 * @returns {string[]}
 */
export function promptsFor(sectionId, ids, customLabels = {}) {
    const section = SECTION_BY_ID.get(sectionId);
    if (!section || !Array.isArray(ids)) return [];
    const lookup = new Map(section.chips.map(chip => [chip.id, chip.prompt]));
    return ids
        .map(id => (isCustomId(id) ? customText(id, customLabels) : lookup.get(id)))
        .filter(Boolean);
}

/**
 * Human-readable labels for the selected chips, in the UI language.
 *
 * @param {string} sectionId
 * @param {string[]} ids
 * @param {'en'|'ru'} lang
 * @param {Record<string, string>} [customLabels]
 * @returns {string[]}
 */
export function labelsFor(sectionId, ids, lang, customLabels = {}) {
    const section = SECTION_BY_ID.get(sectionId);
    if (!section || !Array.isArray(ids)) return [];
    const lookup = new Map(section.chips.map(chip => [chip.id, chip[lang] || chip.en]));
    return ids
        .map(id => (isCustomId(id) ? customText(id, customLabels) : lookup.get(id)))
        .filter(Boolean);
}
