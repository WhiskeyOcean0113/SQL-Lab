import { describe, expect, it } from 'vitest'
import { autospace, spaceText } from '../src/i18n/autospace.ts'

describe('autospace', () => {
  it('spaces Chinese next to Latin, digits and brackets', () => {
    expect(spaceText('数据集叫shop，共3行')).toBe('数据集叫 shop，共 3 行')
    expect(spaceText('用SELECT(星号)取出')).toBe('用 SELECT (星号) 取出')
    expect(spaceText('已经 有 空格')).toBe('已经 有 空格')
    expect(spaceText('句号。English')).toBe('句号。English')
  })

  it('spaces across inline tags without touching code or attributes', () => {
    expect(autospace('<p>用<code>WHERE</code>过滤</p>')).toBe('<p>用 <code>WHERE</code> 过滤</p>')
    expect(autospace('<p><code>a表</code></p>')).toBe('<p><code>a表</code></p>')
    expect(autospace('<a title="表a">表a</a>')).toBe('<a title="表a">表 a</a>')
  })

  it('keeps the space after a term inside its other-language form', () => {
    const term = '<dfn class="term">表<span class="term-alt" lang="en"> (table)</span></dfn>'
    expect(autospace(`<p>${term}里</p>`)).toBe('<p><dfn class="term">表<span class="term-alt" lang="en"> (table) </span></dfn>里</p>')
    expect(autospace(`<p>${term}、行</p>`)).toBe(`<p>${term}、行</p>`)
  })

  it('does not carry across blocks and leaves frozen regions alone', () => {
    expect(autospace('<p>中</p><p>A</p>')).toBe('<p>中</p><p>A</p>')
    expect(autospace('<table translate="no"><tr><td>数据a</td></tr></table>')).toBe('<table translate="no"><tr><td>数据a</td></tr></table>')
    expect(autospace('<p>O&#39;Brien的</p>')).toBe("<p>O'Brien 的</p>")
  })
})
