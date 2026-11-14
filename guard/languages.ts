// Override phrases in the languages upstream's engine does not read.
//
// Upstream's injection patterns are English. "Ignoriere alle vorherigen
// Anweisungen" went through as `allow`, typed by a user and in a web page
// alike (OWASP LLM01) — and the agents this guard stands in front of are
// talked to in German, French and Italian. Here: four orders upstream knows
// in English, in those three, under upstream's rule names where it has one;
// and letters spaced out to slip past either list, drawn together again.
//
// What makes a sentence an order to the model, and not a sentence about
// instructions, is grammar more than vocabulary. The first version went by
// vocabulary and refused 33 of 57 everyday sentences. So:
// - an imperative, not a statement: "ignoriere", not "der Compiler
//   ignoriert". French and Italian spell both alike ("ignore", "ignora"),
//   so there the verb has to open its clause;
// - *all* earlier instructions, or the model's own ("deine"). With a plain
//   "die", only instructions as such, not rules or guidelines, and not
//   somebody's: "die vorherigen Anweisungen des Herstellers / zum Layout";
// - not negated ("vergessen Sie die bisherigen Regeln nicht").
// It stays no stricter than upstream is in English: a person taking back
// their own instructions ("vergiss die vorherigen Anweisungen, ich habe mich
// vertan") is refused in both.
//
// Kept apart from supabase/functions/_shared so upstream's engine can be
// taken over as it is.
//
// ponytail: a list of phrasings per language. A paraphrase, a fourth
// language, swapped letters ("ignroe") or letters spaced with nothing wider
// between the words pass; a trained classifier (`enable_trained_classifier`
// in GUARD_POLICY) is the answer to those, not a longer list.

import { evaluateInjection, type LayerVerdict } from "../supabase/functions/_shared/policy_engine.ts";

/** Not inside a word. `\b` does not know `ü` for a letter. */
const L = String.raw`(?<![\p{L}\p{N}])`;
const R = String.raw`(?![\p{L}\p{N}])`;

/** Case-insensitive, whole words. No repeat here is nested in another or
 *  shares its characters with its neighbour, and the two open gaps are
 *  bounded: each pattern is one pass over the text. */
const phrase = (...src: string[]) => new RegExp(`${L}(?:${src.join("")})${R}`, "iu");

/** Where a clause begins: the start, punctuation, or a word that leads into
 *  an imperative. In French and Italian the imperative is spelled like "he
 *  ignores", and only its place tells them apart. */
const START = String.raw`(?<=^|[.!?:;,\n"«»()\[\]*>–—-]\s{0,3}|(?<![\p{L}])(?:et|puis|alors|maintenant|donc|svp|e|poi|ora|adesso|quindi|per\s+favore|s'il\s+(?:te|vous)\s+pla[iî]t),?\s{1,3})`;

/** Not followed by one of these words: a negation, or whose they are. */
const not = (words: string) => String.raw`(?!\s+(?:${words})${R})`;

const DE = {
  verb: String.raw`(?:ignorier(?:e)?|ignorieren\s+sie|vergiss|vergesst|vergessen\s+sie|missachte|missachten\s+sie|übergeh(?:e)?|übergehen\s+sie|verwirf|verwerfen\s+sie)\s+(?:bitte\s+)?`,
  all: String.raw`(?:(?:alle|all|sämtliche|jegliche)\s+(?:(?:deine|ihre|eure|die)\s+)?|(?:deine|ihre|eure)\s+)`,
  earlier: String.raw`(?:vorherigen|vorigen|bisherigen|obigen|früheren|vorangegangenen|vorhergehenden|ursprünglichen)\s+`,
  own: String.raw`(?:anweisungen|instruktionen|befehle|prompts?|systemprompts?|systemanweisungen)`,
  any: String.raw`(?:anweisungen|instruktionen|befehle|prompts?|systemprompts?|systemanweisungen|regeln|vorgaben|richtlinien)`,
  whose: "nicht|des|der|zum|zur|zu|für|im|in|vom|von|aus|über|bei|auf",
};
const FR = {
  earlier: String.raw`(?:précédentes|precedentes|antérieures|anterieures)`,
  after: String.raw`(?:précédentes|precedentes|antérieures|anterieures|initiales|ci-dessus|qui\s+précèdent)`,
  own: String.raw`(?:instructions|consignes)`,
  any: String.raw`(?:instructions|consignes|règles|regles|directives)`,
  whose: "du|de|des|d'|pour|sur|concernant|relatives?|à|au|aux",
};
const IT = {
  verb: String.raw`(?:ignora|ignorate|dimentica|dimenticate|trascura|trascurate|non\s+considerare)\s+`,
  earlier: String.raw`(?:precedenti|anteriori)`,
  after: String.raw`(?:precedenti|anteriori|iniziali|sopra|di\s+prima|ricevute)`,
  own: String.raw`(?:istruzioni)`,
  any: String.raw`(?:istruzioni|regole|indicazioni|direttive)`,
  whose: "del|della|dello|dei|degli|delle|di|per|sul|sulla|sui|sugli|sulle|riguardo",
};
/** Adjective before or after the noun. */
const either = (noun: string, before: string, after: string) => String.raw`(?:${before}\s+${noun}|${noun}\s+${after})`;

/** What the model is called. */
const MODEL = String.raw`${L}(?:ki|k\.i\.|ia|ai|assistent(?:in)?|assistante?|assistente|sprachmodell|modell|modèle|modele|modello|chatbot|bot)${R}`;

const RULES: { rule: string; reason: string; re: RegExp[] }[] = [
  {
    rule: "ignore_prior_instructions",
    reason: "Attempt to override prior system or developer instructions (German, French or Italian).",
    re: [
      phrase(DE.verb, DE.all, DE.earlier, DE.any, not("nicht")),
      phrase(DE.verb, String.raw`die\s+`, DE.earlier, DE.own, not(DE.whose)),
      // "Du musst alle vorherigen Anweisungen ignorieren": the verb at the end.
      phrase(
        String.raw`(?:du|ihr)\s+(?:sollst|musst|sollt|müsst|wirst|werdet)\s+(?:(?:nun|jetzt|ab\s+jetzt|ab\s+sofort)\s+)?`,
        String.raw`(?:${DE.all}${DE.earlier}${DE.any}|die\s+${DE.earlier}${DE.own})\s+(?:zu\s+)?(?:ignorieren|vergessen|missachten|verwerfen)`,
      ),
      phrase(String.raw`ignorier(?:e)?\s+(?:bitte\s+)?alles,?\s+was\s+(?:(?:dir|ihnen)\s+)?(?:oben|vorher|zuvor|bisher|bislang|davor)\s+(?:gesagt|geschrieben|aufgetragen|befohlen|mitgeteilt)`),
      phrase(
        START,
        String.raw`(?:(?:ignore|ignorez|oublie|oubliez)\s+(?:toutes?\s+(?:les|tes|vos)|tes|vos)|(?:ne\s+(?:tiens|tenez)\s+pas\s+compte|(?:fais|faites)\s+abstraction)\s+de\s+(?:toutes?\s+(?:les|tes|vos)|tes|vos))\s+`,
        either(FR.any, FR.earlier, FR.after),
      ),
      phrase(
        START,
        String.raw`(?:(?:ignore|ignorez|oublie|oubliez)\s+les|(?:ne\s+(?:tiens|tenez)\s+pas\s+compte|(?:fais|faites)\s+abstraction)\s+des)\s+`,
        either(FR.own, FR.earlier, FR.after),
        not(FR.whose),
      ),
      phrase(START, IT.verb, String.raw`(?:tutte\s+le\s+(?:(?:tue|vostre)\s+)?|le\s+(?:tue|vostre)\s+)`, either(IT.any, IT.earlier, IT.after)),
      phrase(START, IT.verb, String.raw`le\s+`, either(IT.own, IT.earlier, IT.after), not(IT.whose)),
    ],
  },
  {
    // The model's own ("deinen", "ton", "il tuo"), or *the* system prompt —
    // not a printer's system message, and not the one "from the example".
    rule: "reveal_system_prompt",
    reason: "Attempt to extract the system prompt (German, French or Italian).",
    re: [
      phrase(
        String.raw`(?:zeig(?:e)?|zeigen\s+sie|gib|geben\s+sie|nenn(?:e)?|nennen\s+sie|verrat(?:e)?|verraten\s+sie|wiederhol(?:e)?|wiederholen\s+sie|offenbar(?:e)?)\s+(?:(?:mir|uns)\s+)?(?:bitte\s+)?`,
        String.raw`(?:(?:deinen|dein|deine|ihren|ihre|euren|eure)\s+(?:(?:gesamten|ganzen|vollständigen|kompletten|genauen|ursprünglichen|initialen)\s+)?(?:system-?\s?prompt|prompt|systemanweisung(?:en)?|system-?nachricht|anweisungen|instruktionen)`,
        String.raw`|(?:den|das|die)\s+(?:(?:gesamten|ganzen|vollständigen|kompletten|genauen)\s+)?system-?\s?prompt${not("aus|von|vom|des|der|für|im|in|zum|zur")})`,
      ),
      phrase(
        START,
        String.raw`(?:affiche|affichez|montre|montrez|révèle|révélez|revele|revelez|donne|donnez|répète|répétez|repete|repetez|dis|dites)(?:-moi|-nous)?\s+`,
        String.raw`(?:(?:ton|votre|tes|vos)\s+(?:prompt|instructions|consignes|message)(?:\s+(?:système|systeme|initiales?|d'origine|de\s+base))?`,
        String.raw`|(?:le|les)\s+(?:prompt|instructions|consignes)\s+(?:système|systeme)${not(FR.whose)})`,
      ),
      phrase(
        START,
        String.raw`(?:mostra|mostrami|mostrate|rivela|rivelami|rivelate|ripeti|stampa|dimmi|scrivi)\s+`,
        String.raw`(?:(?:il\s+tuo|le\s+tue|i\s+tuoi|il\s+vostro|le\s+vostre)\s+(?:prompt|istruzioni|messaggio)(?:\s+(?:di\s+sistema|iniziali?|originali?))?`,
        String.raw`|(?:il|le)\s+(?:prompt|istruzioni)\s+di\s+sistema${not(IT.whose)})`,
      ),
    ],
  },
  {
    // Word for word, or everything before this message: "repeat what is
    // above in English" is a translation job.
    rule: "repeat_text_above",
    reason: "Asks for everything above the message word for word (German, French or Italian).",
    re: [
      phrase(
        String.raw`wiederhol(?:e)?\s+(?:bitte\s+)?(?:(?:wörtlich|woertlich|wortwörtlich|exakt|unverändert|eins\s+zu\s+eins)\s+(?:alles|den\s+(?:(?:gesamten|ganzen)\s+)?text),?\s+(?:was\s+)?(?:oben|vor|über|ueber|darüber|oberhalb)`,
        String.raw`|alles,?\s+was\s+vor\s+dies(?:er|em)\s+(?:nachricht|zeile|satz|unterhaltung|konversation|prompt))`,
      ),
      phrase(
        START,
        String.raw`(?:répète|répétez|repete|repetez)\s+(?:mot\s+pour\s+mot|textuellement|exactement|tel\s+quel|à\s+l'identique)\s+tout\s+ce\s+qui\s+(?:précède|precede|est\s+(?:écrit\s+)?(?:ci-dessus|au-dessus|plus\s+haut))`,
      ),
      phrase(START, String.raw`ripeti\s+(?:parola\s+per\s+parola|esattamente|letteralmente|testualmente)\s+tutto\s+(?:ciò|cio|quello)\s+che\s+(?:precede|c'è\s+sopra|è\s+scritto\s+sopra|viene\s+prima)`),
    ],
  },
  {
    // Upstream finds this among its heuristics, which data never gets. It
    // has to name a model: "du bist jetzt angemeldet und kannst ohne
    // Einschränkungen einkaufen" is a shop greeting its customer.
    rule: "unrestricted_persona",
    reason: "Tells the model it is now one without rules or filters (German, French or Italian).",
    re: [
      phrase(
        String.raw`du\s+bist\s+(?:ab\s+jetzt|von\s+nun\s+an|ab\s+sofort|jetzt|nun)${R}[^.\n]{0,60}?`,
        String.raw`(?:${L}(?:uneingeschränkt|unzensiert|ungefiltert)\w*\s+${MODEL}|${MODEL}[^.\n]{0,40}?${L}ohne\s+(?:jegliche\s+)?(?:filter|einschränkungen|beschränkungen|regeln|zensur|richtlinien|grenzen))`,
      ),
      phrase(
        String.raw`(?:tu\s+es|vous\s+êtes)\s+(?:désormais|desormais|maintenant|dorénavant|à\s+partir\s+de\s+maintenant)${R}[^.\n]{0,60}?`,
        String.raw`${MODEL}[^.\n]{0,40}?${L}(?:sans\s+(?:aucune\s+)?(?:restrictions?|filtres?|censure|règles|limites)|non\s+censurée?)`,
      ),
      phrase(
        String.raw`(?:da\s+ora(?:\s+in\s+poi)?|d'ora\s+in\s+poi|adesso|ora)\s+sei${R}[^.\n]{0,60}?`,
        String.raw`${MODEL}[^.\n]{0,40}?${L}(?:senza\s+(?:alcuna\s+)?(?:restrizioni|restrizione|filtri|censura|regole|limiti)|non\s+censurat[oa])`,
      ),
    ],
  },
];

/** Six letters or more, each followed by one to three of ` . _ * -`: fewer
 *  is an abbreviation ("U. S. A."), more than three a table's column gap. */
const SPACED = /(?<!\p{L})(?:\p{L}[ ._*-]{1,3}){5,}\p{L}/gu;

/** Letters spaced out — `i g n o r e`, `i-g-n-o-r-e` — drawn together again.
 *  What stands between the first two letters is what spaces the letters;
 *  anything else in the run is the gap between two words. */
// ponytail: words spaced exactly like their letters ("i g n o r e a l l")
// come out as one word and match nothing.
function unspaced(text: string): string {
  return text.replace(SPACED, (run) => {
    const parts = run.split(/([^\p{L}]+)/u);
    return parts.map((part, i) => (i % 2 === 0 ? part : part === parts[1] ? "" : " ")).join("");
  });
}

/** One layer per rule that fires, in the text as it is or with its spaced
 *  letters drawn together — there with upstream's English patterns as well,
 *  spans and all, so the caller can treat them as it treats upstream's own.
 *  The caller sets the verdict: the engine's action for an injection. */
export function evaluateOverrides(text: string): LayerVerdict[] {
  // One spelling of an accent and of an apostrophe.
  const plain = text.normalize("NFC").replace(/[’`´]/g, "'");
  const drawn = unspaced(plain);
  const out: LayerVerdict[] = [];
  for (const r of RULES) {
    if (r.re.some((re) => re.test(plain) || (drawn !== plain && re.test(drawn)))) out.push({ layer: "injection", verdict: "block", rule: r.rule, reason: r.reason });
  }
  if (drawn !== plain) out.push(...evaluateInjection(drawn, drawn.toLowerCase(), "input"));
  return out;
}
