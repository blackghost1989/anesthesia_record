import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
    base: mode === 'github' ? '/anesthesia_record/' : '/',
}))
