import test from 'node:test';
import assert from 'node:assert/strict';
import {DVOLADA_ORANGE, DVOLADA_DARK_CHROME, isDarkTheme, applyDvoladaTheme} from '../src/theme-policy.js';

function fakeDocument() {
  const properties = {};
  const root = {style: {setProperty: (key, value) => {properties[key] = value}}, dataset: {}};
  const meta = {setAttribute: (key, value) => {meta[key] = value}};
  return {root, meta, properties};
}

test('official orange cannot be replaced by a saved/device accent in production', () => {
  for (const previewAccent of ['#ff0000', '#00ff00', '#010203', undefined]) {
    const {root, meta, properties} = fakeDocument();
    assert.equal(applyDvoladaTheme({root, themeColorMeta: meta, theme:'light', previewAccent}), 'light');
    assert.equal(properties['--accent'], DVOLADA_ORANGE);
    assert.equal(meta.content, DVOLADA_ORANGE);
    assert.equal(root.style.colorScheme, 'light');
  }
});

test('explicit light or dark mode wins over operating-system preference', () => {
  assert.equal(isDarkTheme('light', {prefersDark:true}), false);
  assert.equal(isDarkTheme('dark', {prefersDark:false}), true);
  assert.equal(isDarkTheme('system', {prefersDark:true}), true);
  assert.equal(isDarkTheme('system', {prefersDark:false}), false);
  assert.equal(isDarkTheme('hour', {hour:18}), true);
  assert.equal(isDarkTheme('hour', {hour:6}), false);
});

test('dark theme updates native controls and browser bar, keeping orange buttons', () => {
  const {root, meta, properties} = fakeDocument();
  assert.equal(applyDvoladaTheme({root, themeColorMeta:meta, theme:'dark'}), 'dark');
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(root.style.colorScheme, 'dark');
  assert.equal(meta.content, DVOLADA_DARK_CHROME);
  assert.equal(properties['--accent'], DVOLADA_ORANGE);
});

test('accent override is restricted to internal local preview', () => {
  const d = fakeDocument();
  applyDvoladaTheme({root:d.root,themeColorMeta:d.meta,internalPreview:true,previewAccent:'#123456'});
  assert.equal(d.properties['--accent'], '#123456');
  applyDvoladaTheme({root:d.root,themeColorMeta:d.meta,internalPreview:true,previewAccent:'red'});
  assert.equal(d.properties['--accent'], DVOLADA_ORANGE);
});
