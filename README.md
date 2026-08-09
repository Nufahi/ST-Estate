# Estate for SillyTavern

Nobody ever describes where the characters live. The card covers a face, a
history and a temperament, and then every scene happens in an unlit box with a
bed in it. The prose goes vague, and image prompts turn the place into a
generic hovel because the model has nothing to work with.

Estate fixes the input side. You pick what the home should be — loft, japandi,
modest means, earth tones, golden hour, a cat, walls of books — the model
writes the description, and the extension turns it into lorebook entries with
keyword patterns that actually fire.

## What it does

- **A tag board, not a blank prompt.** Two of them: a home board — dwelling,
  style, means, condition, era, palette, light, rooms, signature features —
  and a building board for anywhere nobody lives. Sections fold, and only the
  ones you open are built. Plus a free-form field for anything the tags
  cannot say.
- **A must-cover list.** Tags describe a kind of place, not a checklist. Ask
  for a studio flat and you get the bed and the sitting corner and no kitchen,
  no bathroom. Name them here — `kitchen, bathroom, toilet` — and each one is
  described whether or not the model finds it interesting.
- **Per-character or per-persona.** Write a home for the character, for your
  persona, or one shared household for both.
- **A visual block on every entry.** Alongside the prose, each entry carries a
  comma-separated tag list — materials, palette, light quality, the objects
  that define the frame. That is the part image generation feeds on.
- **Correct keyword patterns.** Russian keywords get Cyrillic lookaround
  patterns, English ones get `\b` boundaries, and the extension builds them —
  the model never writes a regex.
- **Reads the lore you already have.** The lorebooks bound to the chat and to
  the character card are fed in as reference, so a new place fits the world
  instead of contradicting it. Estate's own entries are skipped, so later runs
  are not copies of the first.
- **Review before writing.** Nothing reaches the lorebook until you have seen
  the entries, unchecked what you do not want, and edited the rest.
- **A separate model.** Route generation through any saved connection profile,
  so a cheap model can do the furniture while your good one runs the chat.
- **English / Русский.** Follows SillyTavern's language setting.

## Installation

**Extensions → Install Extension**, paste the repository URL.

Or clone into `SillyTavern/data/<user>/extensions/third-party/ST-Estate`.

Requires a Chat Completion API with an active preset, or one saved connection
profile.

## Usage

Open **Estate** from the magic-wand menu, or run `/estate`.

Pick your tags, choose where the entries should go, press **Generate**. The
review dialog opens with the finished entries; edit anything, then **Write to
lorebook**.

Your picks are remembered **per chat**. The tags, the free text, the must-cover
list, whose home it is and which lorebook it lands in belong to the chat they
were chosen in, and they travel with it on export or import. Opening Estate in
a different chat gives a clean board rather than the last story's answers.

What stays global is what is about you rather than about a place: the model,
the entry length, the keyword script, the context toggles, the lorebook name
template, and any tags you invented yourself — a tag you made up is part of
your vocabulary, and retyping it in every chat would be the same annoyance
from the other end.

## Keywords

This is the part that usually goes wrong, so the extension does not delegate
it. The model returns bare word stems with a declared mode, and the patterns
are compiled from those.

| Mode | You give it | It becomes | Matches |
| --- | --- | --- | --- |
| `stem` | `кухн` | `/(?<![А-Яа-яЁё])кухн[А-Яа-яЁё]*/i` | кухня, кухни, на кухне, кухонный |
| `exact` | `дом` | `/(?<![А-Яа-яЁё])дом(?![А-Яа-яЁё])/i` | дом — but not домой, домогательство |
| `group` | `couch\|sofa\|settee` | `/\b(?:couch\|sofa\|settee)\b/i` | any of the three |
| `suffix` | `cook +s,ed,ing` | `/\bcook(?:s\|ed\|ing)?\b/i` | cook, cooks, cooked, cooking |
| `proper` | `Crimson Bar` | `Crimson Bar` | plain text, no regex |

Every compiled pattern is validated before it is written: it must compile, it
must carry the `i` flag, it must contain no spaces, and `\b` next to Cyrillic
is rejected outright — word boundaries are computed from `[A-Za-z0-9_]`, so
they silently misfire on Russian.

In the review dialog you edit the stems, not the patterns. Type
`stem: подвал` or just `подвал`; the compiled result appears underneath, with
a plain-language note of what it will match.

## How entries are written

Every entry is keyed and depth-anchored — present when the place comes up,
absent when it does not.

| Field | Value | Why |
| --- | --- | --- |
| `position` | `4` (at depth) | Injected near the action, not pinned to the top |
| `depth` | `3` | Close enough to matter, far enough not to crowd the scene |
| `order` | `110` whole home, `105` per room | The general description reads first |
| `constant` | `false` | It costs nothing when the scene is elsewhere |
| `excludeRecursion` | `true` | A home description should not drag in other entries |
| `preventRecursion` | `true` | And should not be dragged in by them |

Entries are appended. Estate never modifies or deletes anything already in a
lorebook.

## Where they go

By default a new lorebook is created — `Estate - {char}` — and bound to the
current chat, which leaves the character's own lorebooks untouched. You can
instead pick an existing lorebook, or bind a new one to the character card or
the active persona.

Binding to the card never overwrites a lorebook the character already has. If
the card carries one, Estate's book is attached alongside it as an auxiliary
book — the same list the Character Lore panel shows.

## Settings

Under **Extensions → Estate**:

| Setting | Description |
| --- | --- |
| **New lorebook name** | Template for created lorebooks. Placeholders: `{char}`, `{user}`, `{chat}` |
| **Tag sections open as** | All collapsed, all expanded, or only the ones already holding a pick. A section builds its chips when it opens, so this is a speed setting as much as a layout one |
| **Extra instruction** | Appended to every generation — for rules the model keeps forgetting |

Everything else lives in the dialog and is remembered between runs.

## Native mechanisms reused

| Concern | What it uses |
| --- | --- |
| Entry creation | `createWorldInfoEntry` — so the entry schema is never hand-rolled |
| Saving | `saveWorldInfo(name, data, true)` |
| Creation | `createNewWorldInfo` + `updateWorldInfoList` |
| Chat binding | `chat_metadata.world_info` + `saveMetadata()` |
| Card binding | `writeExtensionField(id, 'world', name)`, or `world_info.charLore` when the card already has a book |
| Persona binding | `power_user.persona_description_lorebook` |
| Generation | `generateRaw()` / `ConnectionManagerRequestService.sendRequest()` |
| Cancellation | `AbortController` + `stopGeneration()` |

## Notes

- Prompt assembly targets Chat Completion. A Text Completion profile can run
  the generation, but the request is still built as a message list.
- A malformed reply is retried once, with the parser's own error handed back
  to the model. Truncated replies are salvaged down to the last complete entry
  rather than discarded.
- `keys` is requested before `content` in the schema, and the token budget is
  sized for the keyword arrays as well as the prose. Both exist because the
  description is long enough to exhaust the reply on chattier models, and
  whatever follows it is what gets cut — which used to be the keywords.
- An entry that comes back with no keywords triggers a second pass, and is
  flagged in the review dialog if it is still keyless. Such an entry would sit
  in the lorebook and never fire.

## License

MIT. See [`LICENSE`](./LICENSE).
