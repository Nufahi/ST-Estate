/**
 * Estate — DOM helpers.
 *
 * Every node is built with createElement and textContent. Nothing in this
 * extension ever interpolates a value into an HTML string.
 */

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
export function node(tag, className = '', text = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
}

/**
 * A labelled checkbox row.
 *
 * @param {string} id
 * @param {string} label
 * @param {boolean} checked
 * @returns {{row: HTMLLabelElement, input: HTMLInputElement}}
 */
export function checkbox(id, label, checked) {
    const row = node('label', 'est-toggle');
    row.htmlFor = id;
    const input = /** @type {HTMLInputElement} */ (node('input'));
    input.id = id;
    input.type = 'checkbox';
    input.checked = !!checked;
    row.append(input, node('span', 'est-toggle__label', label));
    return { row, input };
}

/**
 * A row of mutually exclusive buttons, driven by `aria-pressed`.
 *
 * @param {Array<{id: string, label: string}>} options
 * @param {string} active
 * @param {(id: string) => void} [onChange]
 * @returns {{row: HTMLElement, buttons: HTMLButtonElement[], value: () => string}}
 */
export function segmented(options, active, onChange) {
    const row = node('div', 'est-segmented');
    const buttons = [];

    for (const option of options) {
        const button = /** @type {HTMLButtonElement} */ (node('button', 'est-seg', option.label));
        button.type = 'button';
        button.dataset.value = option.id;
        button.setAttribute('aria-pressed', String(option.id === active));
        button.addEventListener('click', () => {
            for (const other of buttons) other.setAttribute('aria-pressed', String(other === button));
            onChange?.(option.id);
        });
        buttons.push(button);
        row.appendChild(button);
    }

    const value = () => buttons.find(button => button.getAttribute('aria-pressed') === 'true')?.dataset.value ?? active;
    return { row, buttons, value };
}

/**
 * A titled card with an optional trailing element in its heading.
 *
 * @param {string} title
 * @param {HTMLElement} [aside]
 * @returns {{card: HTMLElement, body: HTMLElement, heading: HTMLElement}}
 */
export function card(title, aside) {
    const element = node('section', 'est-card');
    const heading = node('div', 'est-card__heading');
    heading.appendChild(node('span', 'est-card__title', title));
    if (aside) heading.appendChild(aside);
    const body = node('div', 'est-card__body');
    element.append(heading, body);
    return { card: element, body, heading };
}

/** @returns {HTMLElement} a muted hint paragraph. */
export function hint(text) {
    return node('p', 'est-hint', text);
}

/**
 * A labelled field wrapper for an input or textarea.
 *
 * @param {string} label
 * @param {HTMLElement} control
 * @param {string} [description]
 * @returns {HTMLElement}
 */
export function field(label, control, description = '') {
    const wrap = node('label', 'est-field');
    wrap.appendChild(node('span', 'est-field__label', label));
    wrap.appendChild(control);
    if (description) wrap.appendChild(hint(description));
    return wrap;
}

/**
 * @param {'text'|'number'} type
 * @param {object} [attributes]
 * @returns {HTMLInputElement}
 */
export function input(type, attributes = {}) {
    const element = /** @type {HTMLInputElement} */ (node('input', 'text_pole'));
    element.type = type;
    for (const [key, value] of Object.entries(attributes)) {
        if (value === undefined || value === null) continue;
        element.setAttribute(key, String(value));
    }
    return element;
}

/**
 * @param {number} rows
 * @param {string} [value]
 * @param {string} [placeholder]
 * @returns {HTMLTextAreaElement}
 */
export function textarea(rows, value = '', placeholder = '') {
    const element = /** @type {HTMLTextAreaElement} */ (node('textarea', 'text_pole est-textarea'));
    element.rows = rows;
    element.value = value;
    if (placeholder) element.placeholder = placeholder;
    return element;
}

/**
 * @param {Array<{value: string, label: string}>} options
 * @param {string} selected
 * @returns {HTMLSelectElement}
 */
export function select(options, selected) {
    const element = /** @type {HTMLSelectElement} */ (node('select', 'text_pole'));
    for (const option of options) {
        element.appendChild(new Option(option.label, option.value, false, option.value === selected));
    }
    element.value = selected;
    return element;
}

/**
 * @param {string} label
 * @param {string} [icon] a Font Awesome class list
 * @returns {HTMLButtonElement}
 */
export function button(label, icon = '') {
    const element = /** @type {HTMLButtonElement} */ (node('button', 'menu_button'));
    element.type = 'button';
    if (icon) {
        const glyph = node('i', icon);
        glyph.setAttribute('aria-hidden', 'true');
        element.appendChild(glyph);
    }
    element.appendChild(node('span', '', label));
    return element;
}
