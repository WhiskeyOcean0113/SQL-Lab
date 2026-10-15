import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { buildContent } from './build-content.ts'

// Serves the built course as `virtual:content`. In dev, editing anything under
// content/ rebuilds it and reloads the page; problems show in the terminal.

const ID = 'virtual:content'
const RESOLVED = '\0' + ID

export function contentPlugin(contentDir: string): Plugin {
  const root = resolve(contentDir)
  return {
    name: 'sql-lab-content',
    resolveId: id => (id === ID ? RESOLVED : undefined),
    load(id) {
      if (id !== RESOLVED) return
      const { course, problems } = buildContent(root)
      for (const p of problems) this.warn(p)
      return `export default ${JSON.stringify(course)}`
    },
    configureServer(server) {
      server.watcher.add(root)
      const reload = (file: string) => {
        if (!file.startsWith(root)) return
        const mod = server.moduleGraph.getModuleById(RESOLVED)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('change', reload)
      server.watcher.on('add', reload)
      server.watcher.on('unlink', reload)
    },
  }
}
