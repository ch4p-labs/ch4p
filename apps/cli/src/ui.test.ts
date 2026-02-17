/**
 * Tests for the shared CLI styling module.
 *
 * Tests pure rendering functions: box(), sectionHeader(), kvRow(),
 * separator(), visibleLength(), centerPad(), statusPrefix(), statusBadge().
 */

import { describe, it, expect } from 'vitest';
import {
  box,
  sectionHeader,
  kvRow,
  separator,
  visibleLength,
  centerPad,
  statusPrefix,
  statusBadge,
  chatHeader,
  tokenFooter,
  sessionBanner,
  TEAL,
  TEAL_DIM,
  RESET,
  BOLD,
  DIM,
  GREEN,
  YELLOW,
  RED,
  BOX,
  CHECK,
  CROSS,
  WARN,
  BULLET,
  SPINNER_CHARS,
  CHAPPIE_SMALL,
  CHAPPIE_GLYPH,
  PROMPT_CHAR,
} from './ui.js';

// ---------------------------------------------------------------------------
// Constants sanity checks
// ---------------------------------------------------------------------------

describe('color constants', () => {
  it('TEAL is a true-color escape sequence', () => {
    expect(TEAL).toContain('38;2;');
    expect(TEAL).toContain('\x1b[');
  });

  it('TEAL_DIM is a dimmer true-color escape', () => {
    expect(TEAL_DIM).toContain('38;2;');
    expect(TEAL_DIM).not.toBe(TEAL);
  });

  it('RESET clears all formatting', () => {
    expect(RESET).toBe('\x1b[0m');
  });

  it('standard ANSI colors are defined', () => {
    expect(GREEN).toBe('\x1b[32m');
    expect(YELLOW).toBe('\x1b[33m');
    expect(RED).toBe('\x1b[31m');
  });
});

describe('BOX characters', () => {
  it('has all six box-drawing characters', () => {
    expect(BOX.topLeft).toBe('\u256d');
    expect(BOX.topRight).toBe('\u256e');
    expect(BOX.bottomLeft).toBe('\u2570');
    expect(BOX.bottomRight).toBe('\u256f');
    expect(BOX.horizontal).toBe('\u2500');
    expect(BOX.vertical).toBe('\u2502');
  });
});

describe('indicators', () => {
  it('CHECK contains a checkmark', () => {
    expect(CHECK).toContain('\u2713');
    expect(CHECK).toContain(GREEN);
  });

  it('CROSS contains an x-mark', () => {
    expect(CROSS).toContain('\u2717');
    expect(CROSS).toContain(RED);
  });

  it('WARN contains a warning symbol', () => {
    expect(WARN).toContain('\u26a0');
    expect(WARN).toContain(YELLOW);
  });

  it('BULLET contains a filled circle', () => {
    expect(BULLET).toContain('\u25cf');
    expect(BULLET).toContain(TEAL);
  });
});

describe('SPINNER_CHARS', () => {
  it('has 6 spinner characters', () => {
    expect(SPINNER_CHARS).toHaveLength(6);
  });

  it('all entries are single visible characters', () => {
    for (const char of SPINNER_CHARS) {
      expect(char.length).toBeLessThanOrEqual(2); // some unicode is multi-byte
    }
  });
});

describe('CHAPPIE_SMALL', () => {
  it('has 5 lines', () => {
    expect(CHAPPIE_SMALL).toHaveLength(5);
  });

  it('all lines are non-empty strings', () => {
    for (const line of CHAPPIE_SMALL) {
      expect(typeof line).toBe('string');
      expect(line.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// visibleLength
// ---------------------------------------------------------------------------

describe('visibleLength', () => {
  it('returns length of plain text', () => {
    expect(visibleLength('hello')).toBe(5);
  });

  it('strips ANSI escape sequences', () => {
    expect(visibleLength(`${GREEN}hello${RESET}`)).toBe(5);
  });

  it('handles multiple escapes', () => {
    // "error: details" = 14 visible characters
    expect(visibleLength(`${BOLD}${RED}error${RESET}: ${DIM}details${RESET}`)).toBe(14);
  });

  it('returns 0 for empty string', () => {
    expect(visibleLength('')).toBe(0);
  });

  it('returns 0 for ANSI-only string', () => {
    expect(visibleLength(`${RESET}${GREEN}${BOLD}`)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// centerPad
// ---------------------------------------------------------------------------

describe('centerPad', () => {
  it('centers a plain string within given width', () => {
    const result = centerPad('hi', 10);
    expect(result).toBe('    hi'); // 4 spaces + 'hi'
  });

  it('centers with ANSI content using visible width', () => {
    const colored = `${GREEN}hi${RESET}`;
    const result = centerPad(colored, 10);
    // Visible length of 'hi' = 2, so padding = floor((10 - 2) / 2) = 4
    expect(result.startsWith('    ')).toBe(true);
    expect(result).toContain('hi');
  });

  it('does not add padding when line exceeds width', () => {
    const result = centerPad('hello world', 5);
    // No padding because visible length > width
    expect(result).toBe('hello world');
  });
});

// ---------------------------------------------------------------------------
// box
// ---------------------------------------------------------------------------

describe('box', () => {
  it('renders a box with title', () => {
    const result = box('Test', ['Line 1', 'Line 2'], 40);
    expect(result).toContain(BOX.topLeft);
    expect(result).toContain(BOX.topRight);
    expect(result).toContain(BOX.bottomLeft);
    expect(result).toContain(BOX.bottomRight);
    expect(result).toContain('Test');
    expect(result).toContain('Line 1');
    expect(result).toContain('Line 2');
  });

  it('renders a box without title', () => {
    const result = box('', ['Content'], 40);
    expect(result).toContain(BOX.topLeft);
    expect(result).toContain('Content');
  });

  it('includes vertical borders on content lines', () => {
    const result = box('T', ['data'], 40);
    const lines = result.split('\n');
    // Interior lines (not first/last) should contain the vertical bar
    // First line has ╭/╮, last has ╰/╯
    const interiorLines = lines.slice(1, -1);
    for (const line of interiorLines) {
      expect(line).toContain(BOX.vertical);
    }
    // First line should have box corners
    expect(lines[0]).toContain(BOX.topLeft);
    expect(lines[0]).toContain(BOX.topRight);
    // Last line should have box corners
    expect(lines[lines.length - 1]).toContain(BOX.bottomLeft);
    expect(lines[lines.length - 1]).toContain(BOX.bottomRight);
  });

  it('renders empty content gracefully', () => {
    const result = box('Empty', [], 40);
    expect(result).toContain('Empty');
    expect(result).toContain(BOX.topLeft);
    expect(result).toContain(BOX.bottomLeft);
  });
});

// ---------------------------------------------------------------------------
// sectionHeader
// ---------------------------------------------------------------------------

describe('sectionHeader', () => {
  it('renders title with dashes', () => {
    const result = sectionHeader('Providers', 60);
    expect(result).toContain('Providers');
    expect(result).toContain(BOX.horizontal);
  });

  it('uses TEAL for title text', () => {
    const result = sectionHeader('Test');
    expect(result).toContain(TEAL);
    expect(result).toContain(BOLD);
  });
});

// ---------------------------------------------------------------------------
// kvRow
// ---------------------------------------------------------------------------

describe('kvRow', () => {
  it('renders a label-value pair', () => {
    const result = kvRow('Model', 'claude-sonnet-4');
    expect(result).toContain('Model');
    expect(result).toContain('claude-sonnet-4');
    expect(result).toContain(BOLD);
  });

  it('pads label to specified width', () => {
    const result = kvRow('A', 'value', 10);
    // 'A' padded to 10 chars
    expect(result).toContain('A         ');
  });

  it('uses default label width of 14', () => {
    const result = kvRow('Key', 'val');
    // 'Key' padded to 14 chars
    expect(result).toContain('Key           ');
  });
});

// ---------------------------------------------------------------------------
// separator
// ---------------------------------------------------------------------------

describe('separator', () => {
  it('renders a line of horizontal dashes', () => {
    const result = separator(40);
    expect(result).toContain(BOX.horizontal);
    expect(result).toContain(TEAL_DIM);
  });
});

// ---------------------------------------------------------------------------
// statusPrefix
// ---------------------------------------------------------------------------

describe('statusPrefix', () => {
  it('returns green + for pass', () => {
    expect(statusPrefix('pass')).toContain(GREEN);
    expect(statusPrefix('pass')).toContain('+');
  });

  it('returns green + for ok', () => {
    expect(statusPrefix('ok')).toContain(GREEN);
    expect(statusPrefix('ok')).toContain('+');
  });

  it('returns yellow ~ for warn', () => {
    expect(statusPrefix('warn')).toContain(YELLOW);
    expect(statusPrefix('warn')).toContain('~');
  });

  it('returns red x for fail', () => {
    expect(statusPrefix('fail')).toContain(RED);
    expect(statusPrefix('fail')).toContain('x');
  });
});

// ---------------------------------------------------------------------------
// statusBadge
// ---------------------------------------------------------------------------

describe('statusBadge', () => {
  it('returns PASS for pass', () => {
    expect(statusBadge('pass')).toContain('PASS');
    expect(statusBadge('pass')).toContain(GREEN);
  });

  it('returns OK for ok', () => {
    expect(statusBadge('ok')).toContain('OK');
  });

  it('returns WARN for warn', () => {
    expect(statusBadge('warn')).toContain('WARN');
    expect(statusBadge('warn')).toContain(YELLOW);
  });

  it('returns FAIL for fail', () => {
    expect(statusBadge('fail')).toContain('FAIL');
    expect(statusBadge('fail')).toContain(RED);
  });
});

// ---------------------------------------------------------------------------
// Chat UI characters
// ---------------------------------------------------------------------------

describe('CHAPPIE_GLYPH', () => {
  it('is the diamond character', () => {
    expect(CHAPPIE_GLYPH).toBe('\u25c6');
  });

  it('is a single visible character', () => {
    expect(visibleLength(CHAPPIE_GLYPH)).toBe(1);
  });
});

describe('PROMPT_CHAR', () => {
  it('is the heavy right-pointing angle quotation mark', () => {
    expect(PROMPT_CHAR).toBe('\u276f');
  });

  it('is a single visible character', () => {
    expect(visibleLength(PROMPT_CHAR)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// chatHeader
// ---------------------------------------------------------------------------

describe('chatHeader', () => {
  it('includes the icon and label', () => {
    const result = chatHeader(PROMPT_CHAR, 'You');
    expect(result).toContain(PROMPT_CHAR);
    expect(result).toContain('You');
  });

  it('uses TEAL and BOLD styling', () => {
    const result = chatHeader(CHAPPIE_GLYPH, 'ch4p');
    expect(result).toContain(TEAL);
    expect(result).toContain(BOLD);
  });

  it('starts with a newline for visual separation', () => {
    const result = chatHeader(PROMPT_CHAR, 'You');
    expect(result.startsWith('\n')).toBe(true);
  });

  it('has icon followed by space and label', () => {
    const result = chatHeader('>', 'Test');
    // Strip ANSI to check layout
    const plain = result.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('> Test');
  });
});

// ---------------------------------------------------------------------------
// tokenFooter
// ---------------------------------------------------------------------------

describe('tokenFooter', () => {
  it('renders input and output token counts', () => {
    const result = tokenFooter({ inputTokens: 1000, outputTokens: 500 });
    expect(result).toContain('1,000');
    expect(result).toContain('500');
    expect(result).toContain('in');
    expect(result).toContain('out');
  });

  it('uses DIM styling', () => {
    const result = tokenFooter({ inputTokens: 1, outputTokens: 1 });
    expect(result).toContain(DIM);
  });

  it('includes a horizontal dash prefix', () => {
    const result = tokenFooter({ inputTokens: 100, outputTokens: 50 });
    expect(result).toContain(BOX.horizontal);
  });

  it('includes a middle-dot separator', () => {
    const result = tokenFooter({ inputTokens: 100, outputTokens: 50 });
    expect(result).toContain('\u00b7');
  });

  it('formats large numbers with locale separators', () => {
    const result = tokenFooter({ inputTokens: 1234567, outputTokens: 89012 });
    // Number formatting depends on locale but should contain digits
    expect(result).toContain('1');
    expect(result).toContain('89');
  });
});

// ---------------------------------------------------------------------------
// sessionBanner
// ---------------------------------------------------------------------------

describe('sessionBanner', () => {
  it('renders a boxed banner with Chappie mascot', () => {
    const result = sessionBanner({ Model: 'test-model', Tools: '5 loaded' });
    expect(result).toContain(BOX.topLeft);
    expect(result).toContain(BOX.bottomLeft);
    expect(result).toContain('ch4p');
    expect(result).toContain('Model');
    expect(result).toContain('test-model');
  });

  it('includes all info entries', () => {
    const result = sessionBanner({ A: 'one', B: 'two', C: 'three' });
    expect(result).toContain('one');
    expect(result).toContain('two');
    expect(result).toContain('three');
  });

  it('renders CHAPPIE_SMALL art lines', () => {
    const result = sessionBanner({ X: 'val' });
    // Should contain Unicode block characters from the mascot
    expect(result).toContain('\u2588'); // █ (full block from CHAPPIE_SMALL)
  });

  it('renders with empty info', () => {
    const result = sessionBanner({});
    expect(result).toContain('ch4p');
    expect(result).toContain(BOX.topLeft);
    expect(result).toContain(BOX.bottomLeft);
  });

  it('renders keys as bold labels', () => {
    const result = sessionBanner({ Engine: 'test' });
    expect(result).toContain(BOLD);
    expect(result).toContain('Engine');
  });
});
