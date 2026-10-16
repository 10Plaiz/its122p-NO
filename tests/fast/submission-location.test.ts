import { describe, expect, it } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Field } from '../../src/web/components/ui.js';
import { sameReportPoint } from '../../src/web/lib/report-rules.js';

describe('required field labels', () => {
  for (const labelAction of [undefined, createElement('a', {href:'#help'}, 'Help')]) {
    it(`marks required fields accessibly ${labelAction ? 'with' : 'without'} a label action`, () => {
      const html = renderToStaticMarkup(createElement(Field, {
        required:true, label:'Title', htmlFor:'title', labelAction,
        children:createElement('input', {id:'title',required:true}),
      }));
      expect(html).toContain('aria-hidden="true" class="text-danger');
      expect(html).toContain('(required)');
      expect(html).toContain('for="title"');
      if (labelAction) expect(html).toContain('href="#help"');
    });
  }
  it('leaves optional fields unchanged by default', () => {
    const html = renderToStaticMarkup(createElement(Field, {label:'Address',children:createElement('input')}));
    expect(html).not.toContain('(required)');
    expect(html).not.toContain('text-danger');
  });
});

describe('map center confirmation tolerance', () => {
  it('retains confirmation for floating point camera rounding', () => {
    expect(sameReportPoint({lat:14.5547,lng:121.0244},{lat:14.55470000001,lng:121.02440000001})).toBe(true);
  });
  it('invalidates confirmation when the user moves the map', () => {
    expect(sameReportPoint({lat:14.5547,lng:121.0244},{lat:14.5548,lng:121.0244})).toBe(false);
  });
});
