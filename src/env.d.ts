declare module 'virtual:content' {
  const course: import('./content/types.ts').Course
  export default course
}

interface ImportMetaEnv {
  readonly VITE_SQL_LAB_REVIEW?: string
}
