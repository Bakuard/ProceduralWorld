import { defineConfig } from 'vite'

export default defineConfig({
    root: 'src',
    base: './',
    build: {
        outDir: '../build',
        minify: false,
        rollupOptions: {
            output: {
                entryFileNames: 'js/index.js',
                chunkFileNames: 'js/chunk-[name].js',
                assetFileNames: 'resources/[name].[ext]',
            }
        }
    }
});