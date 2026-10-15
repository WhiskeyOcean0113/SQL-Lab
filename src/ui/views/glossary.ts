import { t } from '../../i18n/index.ts'
import type { Ctx } from '../app.ts'
import { html, mount, raw } from '../dom.ts'

export function renderGlossary(root: HTMLElement, ctx: Ctx) {
  const { lang, course } = ctx
  const other = lang === 'zh' ? 'en' : 'zh'
  const terms = [...course.glossary].sort((a, b) => a.en.localeCompare(b.en))
  mount(root, html`
    <div class="wrap">
      <div class="glossary">
        <div class="h-row">
          <p class="kicker">${raw(t(lang, 'glossary.kicker'))}</p>
          <h1 class="display">${raw(t(lang, 'glossary.title'))}</h1>
        </div>
        <div class="terms">
          ${terms.map(term => html`<div id="term-${term.id}"><span class="p">${term[lang]}</span><span class="o" lang="${other === 'zh' ? 'zh-Hans' : 'en'}">${term[other]}</span></div>`)}
        </div>
      </div>
    </div>`)
  window.scrollTo(0, 0)
}
