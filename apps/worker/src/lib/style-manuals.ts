// ── Style-manual registry ────────────────────────────────
// The pluggable copyediting engine. Each publisher style manual is a profile
// composed of three layers:
//   1. `cslStyle`  — CSL key used by the reference formatter (citeproc/Pandoc)
//   2. `lt`        — LanguageTool config (language variant + rule tweaks)
//   3. `aiGuidance`— system-prompt guidance for the LLM copyeditor pass
// Adding a new manual is a data change here — no engine code changes.
import type { StyleManual } from '@pubflow/types'

export interface LtConfig {
  /** BCP-47 language passed to LanguageTool (drives spelling variant). */
  language: string
  /** Rule ids to force-enable for this manual. */
  enabledRules?: string[]
  /** Rule ids to disable for this manual. */
  disabledRules?: string[]
}

export interface StyleManualConfig {
  label: string
  /** CSL style key for reference/citation formatting. */
  cslStyle: string
  lt: LtConfig
  /** Manual-specific mechanics the LLM copyeditor must enforce. */
  aiGuidance: string
}

const US = 'en-US'
const GB = 'en-GB'

export const STYLE_MANUALS: Record<StyleManual, StyleManualConfig> = {
  INHOUSE: {
    label: 'In-house style',
    cslStyle: 'apa',
    lt: { language: US },
    aiGuidance:
      'Apply general scholarly copyediting: correct grammar, punctuation, and ' +
      'consistency, preserve the author’s meaning, and defer to any supplied ' +
      'house-rule overrides.',
  },
  APA7: {
    label: 'APA 7th edition',
    cslStyle: 'apa',
    lt: { language: US, enabledRules: ['SERIAL_COMMA'] },
    aiGuidance:
      'Enforce APA 7: serial (Oxford) comma; numerals for 10 and above and for ' +
      'all numbers in the abstract; author–date in-text citations (Author, Year); ' +
      'sentence case for article/chapter titles in references; "and" in narrative ' +
      'but "&" inside parenthetical citations; Title Case for headings.',
  },
  CHICAGO17: {
    label: 'Chicago 17th edition',
    cslStyle: 'chicago-author-date',
    lt: { language: US, enabledRules: ['SERIAL_COMMA'] },
    aiGuidance:
      'Enforce Chicago 17: serial comma; spell out whole numbers zero through one ' +
      'hundred; notes-bibliography or author-date consistently; headline-style ' +
      'capitalization for titles; "ibid." avoided per 17th ed. shortened citations.',
  },
  AMA11: {
    label: 'AMA 11th edition',
    cslStyle: 'american-medical-association',
    lt: { language: US, enabledRules: ['SERIAL_COMMA'] },
    aiGuidance:
      'Enforce AMA 11: numerals for all numbers (including one through nine) except ' +
      'when beginning a sentence; superscript numbered citations in order of ' +
      'appearance; SI units with a space; expand abbreviations at first use; ' +
      'sentence case for reference titles.',
  },
  MLA9: {
    label: 'MLA 9th edition',
    cslStyle: 'modern-language-association',
    lt: { language: US },
    aiGuidance:
      'Enforce MLA 9: author-page in-text citations (Author 23); Works Cited with ' +
      'containers; Title Case for titles; spell out numbers that can be written in ' +
      'one or two words; serial comma preferred.',
  },
  VANCOUVER: {
    label: 'Vancouver (ICMJE)',
    cslStyle: 'vancouver',
    lt: { language: US },
    aiGuidance:
      'Enforce Vancouver/ICMJE: numbered references in citation order with ' +
      'parenthetical or superscript numerals; abbreviate journal titles per NLM; ' +
      'list up to 6 authors then et al.; sentence case article titles.',
  },
  IEEE: {
    label: 'IEEE',
    cslStyle: 'ieee',
    lt: { language: US },
    aiGuidance:
      'Enforce IEEE: bracketed numeric citations [1] in order of appearance; ' +
      'reference list numbered in citation order; abbreviate first names to initials; ' +
      'Title Case for article titles in quotation marks.',
  },
  CSE: {
    label: 'CSE (Council of Science Editors)',
    cslStyle: 'council-of-science-editors',
    lt: { language: US },
    aiGuidance:
      'Enforce CSE citation-sequence or name-year consistently; sentence case for ' +
      'titles; SI units; abbreviate journal names per CASSI; numerals for measured ' +
      'quantities.',
  },
  HARVARD: {
    label: 'Harvard (Cite Them Right)',
    cslStyle: 'harvard-cite-them-right',
    lt: { language: GB, disabledRules: ['MORFOLOGIK_RULE_EN_US'] },
    aiGuidance:
      'Enforce Harvard (Cite Them Right) with British spelling (-ise, colour, ' +
      'centre); author-date in-text (Author, Year); reference list alphabetical by ' +
      'author; single quotation marks for titles.',
  },
}

export function getStyleManual(manual: StyleManual): StyleManualConfig {
  return STYLE_MANUALS[manual] ?? STYLE_MANUALS.INHOUSE
}
