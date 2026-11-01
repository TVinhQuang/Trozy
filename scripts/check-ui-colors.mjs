// Independent token contrast checks. No browser, database, network or pixel claims.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';

const css = postcss.parse(await readFile(new URL('../src/frontend/styles.css', import.meta.url), 'utf8'));
const tokens = new Map();
css.walkRules(rule => {
  if (!rule.selectors?.includes(':root')) return;
  rule.walkDecls(declaration => {
    if (declaration.prop.startsWith('--')) tokens.set(declaration.prop, declaration.value.trim());
  });
});

function resolveToken(name, ancestors = new Set()) {
  assert.ok(!ancestors.has(name), `Circular color token: ${[...ancestors, name].join(' -> ')}`);
  const value = tokens.get(name);
  assert.ok(value, `Missing semantic color token ${name}`);
  const alias = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value);
  if (alias) return resolveToken(alias[1], new Set([...ancestors, name]));
  assert.match(value, /^#(?:[\da-f]{3}|[\da-f]{6})$/i, `${name} must resolve to an opaque hex color; extend this check before adopting another color format`);
  const hex = value.slice(1);
  return hex.length === 3 ? `#${[...hex].map(channel => channel + channel).join('')}` : value;
}

function luminance(hex) {
  const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(foreground, background) {
  const first = luminance(foreground), second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

// Known WCAG endpoints catch an accidental gamma/ratio regression in this helper.
assert.equal(contrast('#000000', '#ffffff'), 21);
assert.equal(contrast('#ffffff', '#ffffff'), 1);

const groups = [];
const group = (label, pairs, minimum) => groups.push({ label, pairs, minimum });

group('Body and secondary text', [
  ['--foreground', '--surface'], ['--foreground', '--background'], ['--foreground', '--secondary'],
  ['--muted', '--surface'], ['--muted', '--background'], ['--muted', '--secondary'], ['--muted', '--table-header'],
], 4.5);
group('Links, selected labels and primary actions', [
  ['--accent-text', '--surface'], ['--accent-text', '--background'], ['--accent-text', '--primary-light'],
  ['--primary-foreground', '--primary'], ['--primary-foreground', '--primary-hover'],
], 4.5);
group('Control boundaries and keyboard focus', [
  ['--control-border', '--surface'], ['--control-border', '--background'],
  ['--primary-border', '--surface'], ['--primary-border', '--background'],
  ['--focus', '--surface'], ['--focus', '--background'], ['--focus', '--primary'], ['--focus', '--primary-hover'], ['--focus', '--primary-light'],
], 3);
group('Status text', ['success', 'warning', 'danger', 'info'].map(name => [`--${name}`, `--${name}-bg`]), 4.5);
group('Chart marks on the surface and track', ['cash', 'cash-current', 'occupied', 'vacant', 'other', 'electric', 'water']
  .flatMap(name => [[`--chart-${name}`, '--surface'], [`--chart-${name}`, '--chart-track']]), 3);

let count = 0;
const failures = [];
for (const { label, pairs, minimum } of groups) {
  const values = [];
  for (const [foreground, background] of pairs) {
    count++;
    try {
      const value = contrast(resolveToken(foreground), resolveToken(background));
      assert.ok(value + Number.EPSILON >= minimum, `${foreground} on ${background}: ${value.toFixed(2)}:1; requires ${minimum}:1`);
      values.push(value);
    } catch (failure) {
      failures.push(`${label}: ${failure.message}`);
    }
  }
  if (values.length === pairs.length) console.log(`PASS ${label}: ${pairs.length} pairs, minimum ${Math.min(...values).toFixed(2)}:1 (requires ${minimum}:1)`);
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`PASS: ${count} semantic token contrast pairs. This checks opaque declared tokens, not computed browser states, photographs, color-vision simulation or rendered layout.`);
}
