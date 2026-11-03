/*
 * The special characters picker. Every entry has a name, so a search for "em dash", "alpha" or "section
 * sign" finds it. Accented letters and Greek letters are built from Unicode, so no letter is missing.
 */

export interface CharEntry {
  char: string;
  name: string;
}

export interface CharCategory {
  id: string;
  label: string;
  entries: readonly CharEntry[];
}

/** "char name" lines, one entry per line. */
function lines(text: string): CharEntry[] {
  return text
    .trim()
    .split('\n')
    .map((line) => {
      const at = line.indexOf(' ');
      return { char: line.slice(0, at), name: line.slice(at + 1).trim() };
    });
}

const PUNCTUATION = lines(`
— em dash
– en dash
‑ non-breaking hyphen
… ellipsis
“ left double quotation mark
” right double quotation mark
‘ left single quotation mark
’ right single quotation mark apostrophe
« left guillemet angle quote
» right guillemet angle quote
‹ single left guillemet
› single right guillemet
„ low double quotation mark
‚ low single quotation mark
§ section sign
¶ pilcrow paragraph sign
† dagger
‡ double dagger
• bullet
· middle dot interpunct
⁂ asterism
※ reference mark
‽ interrobang
¿ inverted question mark
¡ inverted exclamation mark
′ prime minutes feet
″ double prime seconds inches
‰ per mille
№ numero sign
⁄ fraction slash
¦ broken bar
〃 ditto mark
℅ care of
`);

const MATH = lines(`
× multiplication sign times
÷ division sign
± plus or minus
∓ minus or plus
− minus sign
≠ not equal to
≈ almost equal to approximately
≡ identical to
≤ less than or equal to
≥ greater than or equal to
≪ much less than
≫ much greater than
∞ infinity
√ square root
∛ cube root
∑ summation sigma sum
∏ product
∫ integral
∬ double integral
∮ contour integral
∂ partial derivative
∇ nabla del
∆ increment delta
∈ element of
∉ not an element of
∋ contains as member
⊂ subset of
⊃ superset of
⊆ subset of or equal to
⊇ superset of or equal to
∪ union
∩ intersection
∅ empty set
∀ for all
∃ there exists
∄ there does not exist
¬ not sign
∧ logical and
∨ logical or
⊕ circled plus exclusive or
⊗ circled times tensor
∴ therefore
∵ because
∝ proportional to
∠ angle
⊥ perpendicular
∥ parallel to
° degree sign
℃ degree celsius
℉ degree fahrenheit
µ micro sign
ℕ natural numbers
ℤ integers
ℚ rational numbers
ℝ real numbers
ℂ complex numbers
ℵ alef aleph
ℏ reduced planck constant h-bar
⌊ left floor
⌋ right floor
⌈ left ceiling
⌉ right ceiling
⟨ left angle bracket
⟩ right angle bracket
`);

const ARROWS = lines(`
← leftwards arrow
→ rightwards arrow
↑ upwards arrow
↓ downwards arrow
↔ left right arrow
↕ up down arrow
⇐ leftwards double arrow
⇒ rightwards double arrow implies
⇔ left right double arrow if and only if
⇑ upwards double arrow
⇓ downwards double arrow
↖ north west arrow
↗ north east arrow
↘ south east arrow
↙ south west arrow
↩ leftwards arrow with hook return
↪ rightwards arrow with hook
↺ anticlockwise open circle arrow
↻ clockwise open circle arrow
⟵ long leftwards arrow
⟶ long rightwards arrow
⟷ long left right arrow
➔ heavy wide-headed rightwards arrow
➜ heavy round-tipped rightwards arrow
↦ rightwards arrow from bar maps to
`);

const CURRENCY = lines(`
€ euro sign
£ pound sign sterling
¥ yen sign yuan
¢ cent sign
$ dollar sign
₹ indian rupee sign
₽ ruble sign
₩ won sign
₺ turkish lira sign
₦ naira sign
₱ peso sign
₫ dong sign
₴ hryvnia sign
₪ new shekel sign
₿ bitcoin sign
¤ currency sign
`);

const FRACTIONS = lines(`
½ one half
⅓ one third
⅔ two thirds
¼ one quarter
¾ three quarters
⅕ one fifth
⅖ two fifths
⅗ three fifths
⅘ four fifths
⅙ one sixth
⅚ five sixths
⅐ one seventh
⅛ one eighth
⅜ three eighths
⅝ five eighths
⅞ seven eighths
⅑ one ninth
⅒ one tenth
↉ zero thirds
`);

const SCRIPTS = lines(`
⁰ superscript zero
¹ superscript one
² superscript two squared
³ superscript three cubed
⁴ superscript four
⁵ superscript five
⁶ superscript six
⁷ superscript seven
⁸ superscript eight
⁹ superscript nine
⁺ superscript plus
⁻ superscript minus
⁼ superscript equals
⁽ superscript left parenthesis
⁾ superscript right parenthesis
ⁿ superscript n
ⁱ superscript i
₀ subscript zero
₁ subscript one
₂ subscript two
₃ subscript three
₄ subscript four
₅ subscript five
₆ subscript six
₇ subscript seven
₈ subscript eight
₉ subscript nine
₊ subscript plus
₋ subscript minus
₌ subscript equals
₍ subscript left parenthesis
₎ subscript right parenthesis
`);

const SYMBOLS = lines(`
© copyright sign
® registered sign
™ trade mark sign
℗ sound recording copyright
☆ white star
★ black star
✦ black four pointed star
✧ white four pointed star
✶ six pointed black star
❦ floral heart
❧ rotated floral heart bullet
☙ reversed rotated floral heart bullet
♠ spade suit
♣ club suit
♥ heart suit
♦ diamond suit
♩ quarter note music
♪ eighth note music
♫ beamed eighth notes music
♬ beamed sixteenth notes music
♭ music flat sign
♮ music natural sign
♯ music sharp sign
☀ sun
☁ cloud
☂ umbrella
☃ snowman
☾ last quarter moon
✓ check mark
✗ ballot x
☐ ballot box
☑ ballot box with check
☒ ballot box with x
✉ envelope
✎ pencil
✂ scissors
☎ telephone
⌘ place of interest command key
⌥ option key
⇧ upwards white arrow shift key
⌫ erase to the left backspace
♀ female sign
♂ male sign
⚥ male and female sign
☮ peace symbol
☯ yin yang
∗ asterisk operator
◆ black diamond
◇ white diamond
● black circle
○ white circle
■ black square
□ white square
▲ black up-pointing triangle
△ white up-pointing triangle
▼ black down-pointing triangle
▽ white down-pointing triangle
`);

const EMOJI = lines(`
😀 grinning face
😃 grinning face with big eyes
😄 grinning face with smiling eyes
😁 beaming face
😆 grinning squinting face laughing
😅 grinning face with sweat
🤣 rolling on the floor laughing
😂 face with tears of joy
🙂 slightly smiling face
🙃 upside-down face
😉 winking face
😊 smiling face with smiling eyes
😇 smiling face with halo
🥰 smiling face with hearts
😍 smiling face with heart-eyes
🤩 star-struck
😘 face blowing a kiss
😗 kissing face
😚 kissing face with closed eyes
😋 face savoring food
😛 face with tongue
😜 winking face with tongue
🤪 zany face
😝 squinting face with tongue
🤑 money-mouth face
🤗 hugging face
🤭 face with hand over mouth
🤫 shushing face
🤔 thinking face
🤐 zipper-mouth face
🤨 face with raised eyebrow
😐 neutral face
😑 expressionless face
😶 face without mouth
😏 smirking face
😒 unamused face
🙄 face with rolling eyes
😬 grimacing face
😌 relieved face
😔 pensive face
😪 sleepy face
🤤 drooling face
😴 sleeping face
😷 face with medical mask
🤒 face with thermometer
🤕 face with head-bandage
🤢 nauseated face
🤮 face vomiting
🤧 sneezing face
🥵 hot face
🥶 cold face
🥴 woozy face
😵 face with crossed-out eyes
🤯 exploding head
🤠 cowboy hat face
🥳 partying face
😎 smiling face with sunglasses
🤓 nerd face
🧐 face with monocle
😕 confused face
😟 worried face
🙁 slightly frowning face
😮 face with open mouth
😯 hushed face
😲 astonished face
😳 flushed face
🥺 pleading face
😦 frowning face with open mouth
😧 anguished face
😨 fearful face
😰 anxious face with sweat
😥 sad but relieved face
😢 crying face
😭 loudly crying face
😱 face screaming in fear
😖 confounded face
😣 persevering face
😞 disappointed face
😓 downcast face with sweat
😩 weary face
😫 tired face
🥱 yawning face
😤 face with steam from nose
😡 enraged face
😠 angry face
🤬 face with symbols on mouth
😈 smiling face with horns
👿 angry face with horns
💀 skull
👻 ghost
👽 alien
🤖 robot
💩 pile of poo
😺 grinning cat
😸 grinning cat with smiling eyes
😻 smiling cat with heart-eyes
🙈 see-no-evil monkey
🙉 hear-no-evil monkey
🙊 speak-no-evil monkey
💋 kiss mark
💌 love letter
💘 heart with arrow
💝 heart with ribbon
💖 sparkling heart
💗 growing heart
💓 beating heart
💞 revolving hearts
💕 two hearts
💔 broken heart
❤️ red heart
🧡 orange heart
💛 yellow heart
💚 green heart
💙 blue heart
💜 purple heart
🖤 black heart
🤍 white heart
🤎 brown heart
💯 hundred points
💢 anger symbol
💥 collision
💫 dizzy
💦 sweat droplets
💨 dashing away
💬 speech balloon
💭 thought balloon
💤 zzz sleeping
👋 waving hand
🤚 raised back of hand
✋ raised hand
🖖 vulcan salute
👌 ok hand
🤌 pinched fingers
✌️ victory hand
🤞 crossed fingers
🤟 love-you gesture
🤘 sign of the horns
🤙 call me hand
👈 backhand index pointing left
👉 backhand index pointing right
👆 backhand index pointing up
👇 backhand index pointing down
☝️ index pointing up
👍 thumbs up
👎 thumbs down
✊ raised fist
👊 oncoming fist
👏 clapping hands
🙌 raising hands
👐 open hands
🤲 palms up together
🤝 handshake
🙏 folded hands please thank you
✍️ writing hand
💪 flexed biceps
🧠 brain
👀 eyes
👁️ eye
👄 mouth
🧒 child
👶 baby
🧑 person
👩 woman
👨 man
🧓 older person
👵 old woman
👴 old man
🧑‍💻 technologist
🧑‍🎨 artist
🧑‍🏫 teacher
🧑‍🍳 cook
🧑‍🚀 astronaut
🧙 mage wizard
🧚 fairy
🧛 vampire
🧜 merperson mermaid
🧝 elf
👑 crown
🎩 top hat
👓 glasses
🐶 dog face
🐱 cat face
🐭 mouse face
🐰 rabbit face
🦊 fox
🐻 bear
🐼 panda
🐨 koala
🐯 tiger face
🦁 lion
🐮 cow face
🐷 pig face
🐸 frog
🐵 monkey face
🐔 chicken
🐧 penguin
🐦 bird
🦉 owl
🦋 butterfly
🐝 honeybee
🐞 lady beetle ladybug
🐢 turtle
🐍 snake
🐙 octopus
🐬 dolphin
🐳 spouting whale
🦈 shark
🐚 spiral shell
🌸 cherry blossom
🌹 rose
🌻 sunflower
🌼 blossom
🌷 tulip
🌱 seedling
🌿 herb
🍀 four leaf clover
🍁 maple leaf
🍂 fallen leaf
🌲 evergreen tree
🌳 deciduous tree
🌴 palm tree
🌵 cactus
🍄 mushroom
🌍 globe showing europe-africa
🌙 crescent moon
🌕 full moon
🌑 new moon
⭐ star
🌟 glowing star
✨ sparkles
⚡ high voltage lightning
🔥 fire
🌈 rainbow
☀️ sun
⛅ sun behind cloud
🌧️ cloud with rain
⛈️ cloud with lightning and rain
❄️ snowflake
🌊 water wave
💧 droplet
🌫️ fog
🍎 red apple
🍋 lemon
🍓 strawberry
🍒 cherries
🍑 peach
🥑 avocado
🍞 bread
🧀 cheese wedge
🍕 pizza
🍜 steaming bowl noodles
🍰 shortcake
🎂 birthday cake
🍪 cookie
🍫 chocolate bar
☕ hot beverage coffee tea
🍵 teacup without handle
🍷 wine glass
🍺 beer mug
🥂 clinking glasses
🏠 house
🏡 house with garden
🏰 castle
⛪ church
🗼 tokyo tower
🗽 statue of liberty
🌉 bridge at night
🌃 night with stars
🏔️ snow-capped mountain
🏝️ desert island
🚗 automobile car
🚲 bicycle
🚂 locomotive train
✈️ airplane
🚀 rocket
⛵ sailboat
⚓ anchor
⏳ hourglass not done
⌛ hourglass done
⏰ alarm clock
🕯️ candle
💡 light bulb
📚 books
📖 open book
📝 memo
✏️ pencil
🖋️ fountain pen
🖊️ pen
📜 scroll
📌 pushpin
📎 paperclip
🔖 bookmark
🗝️ old key
🔑 key
🔒 locked
🔓 unlocked
💎 gem stone
🎁 wrapped gift
🎈 balloon
🎉 party popper
🎊 confetti ball
🎵 musical note
🎶 musical notes
🎹 musical keyboard piano
🎸 guitar
🎻 violin
🎨 artist palette
🎭 performing arts
🎬 clapper board
📷 camera
🎮 video game
🧩 puzzle piece
♟️ chess pawn
🎲 game die
🏆 trophy
🥇 first place medal
⚽ soccer ball
🏀 basketball
❗ red exclamation mark
❓ red question mark
✅ check mark button
❌ cross mark
⚠️ warning
🚫 prohibited
♻️ recycling symbol
🔔 bell
🔕 bell with slash
🏳️ white flag
🏁 chequered flag
`);

const GREEK_NAMES = [
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'zeta',
  'eta',
  'theta',
  'iota',
  'kappa',
  'lambda',
  'mu',
  'nu',
  'xi',
  'omicron',
  'pi',
  'rho',
  'final sigma',
  'sigma',
  'tau',
  'upsilon',
  'phi',
  'chi',
  'psi',
  'omega',
];

/** The Greek alphabet from Unicode: capitals from U+0391, small letters from U+03B1. */
function greek(): CharEntry[] {
  const small: CharEntry[] = [];
  const capital: CharEntry[] = [];
  GREEK_NAMES.forEach((name, i) => {
    small.push({ char: String.fromCodePoint(0x3b1 + i), name: `greek small letter ${name}` });
    // U+03A2 is not assigned: capitals have no final sigma.
    if (name !== 'final sigma') {
      capital.push({ char: String.fromCodePoint(0x391 + i), name: `greek capital letter ${name}` });
    }
  });
  return [...small, ...capital];
}

const DIACRITICS: readonly (readonly [string, string])[] = [
  ['acute', '́'],
  ['grave', '̀'],
  ['circumflex', '̂'],
  ['tilde', '̃'],
  ['diaeresis umlaut', '̈'],
  ['ring above', '̊'],
  ['cedilla', '̧'],
  ['caron hacek', '̌'],
  ['macron', '̄'],
  ['breve', '̆'],
  ['ogonek', '̨'],
  ['dot above', '̇'],
  ['double acute', '̋'],
];

const OTHER_LETTERS = lines(`
ß sharp s eszett
ẞ capital sharp s
æ ae ligature ash
Æ capital ae ligature ash
œ oe ligature
Œ capital oe ligature
ø o with stroke
Ø capital o with stroke
ð eth
Ð capital eth
þ thorn
Þ capital thorn
ł l with stroke
Ł capital l with stroke
đ d with stroke
Đ capital d with stroke
ı dotless i
ŋ eng
Ŋ capital eng
ſ long s
`);

/** Every Latin letter with one accent that Unicode has as a single character, small letters first. */
function accented(): CharEntry[] {
  const out: CharEntry[] = [];
  for (const base of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const capital = base !== base.toLowerCase();
    for (const [name, mark] of DIACRITICS) {
      const char = (base + mark).normalize('NFC');
      // Only accents that Unicode has as one precomposed character.
      if (String.fromCodePoint(char.codePointAt(0) ?? 0) !== char) continue;
      out.push({ char, name: `${capital ? 'capital ' : ''}${base.toLowerCase()} with ${name}` });
    }
  }
  return [...out, ...OTHER_LETTERS];
}

export const CHARACTER_CATEGORIES: readonly CharCategory[] = [
  { id: 'punctuation', label: 'Punctuation', entries: PUNCTUATION },
  { id: 'letters', label: 'Accented letters', entries: accented() },
  { id: 'greek', label: 'Greek', entries: greek() },
  { id: 'math', label: 'Math', entries: MATH },
  { id: 'arrows', label: 'Arrows', entries: ARROWS },
  { id: 'currency', label: 'Currency', entries: CURRENCY },
  { id: 'fractions', label: 'Fractions', entries: FRACTIONS },
  { id: 'scripts', label: 'Superscript and subscript', entries: SCRIPTS },
  { id: 'symbols', label: 'Symbols', entries: SYMBOLS },
  { id: 'emoji', label: 'Emoji', entries: EMOJI },
];

const ALL = CHARACTER_CATEGORIES.flatMap((c) => c.entries);

/** Entries whose name has every query word, or whose character is the query. Name starts rank first. */
export function searchCharacters(query: string, limit = 120): CharEntry[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const words = q.split(/\s+/);
  const hits = ALL.filter((e) => e.char === query.trim() || words.every((w) => e.name.includes(w)));
  const starts = hits.filter((e) => e.name.startsWith(q));
  const rest = hits.filter((e) => !e.name.startsWith(q));
  return [...starts, ...rest].slice(0, limit);
}

/** The entry for a character, for recent picks. */
export function characterEntry(char: string): CharEntry | undefined {
  return ALL.find((e) => e.char === char);
}
