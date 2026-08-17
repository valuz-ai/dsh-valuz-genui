/**
 * cordis.patch.yml is shipped verbatim and parsed by the dsh profile loader;
 * a syntax error there breaks every install (the scoped package name starts
 * with `@`, a reserved YAML indicator, so it must stay quoted).
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import pkg from '../../package.json'

describe('cordis.patch.yml', () => {
  const patch = parse(readFileSync(new URL('../../cordis.patch.yml', import.meta.url), 'utf8')) as unknown

  it('inserts the valuz-genui row resolving this package', () => {
    expect(patch).toEqual([
      { insert: [{ id: 'valuz-genui', name: pkg.name }] },
    ])
  })
})
