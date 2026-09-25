import { defineConfig } from 'vite';

export default defineConfig({
    root: 'src',
    base: './',
    build: {
        outDir: '../build',
        minify: false,
        rollupOptions: {
            output: {
                entryFileNames: 'js/index-[hash].js',
                assetFileNames: 'resources/[name].[ext]',
                inlineDynamicImports: true
            }
        }
    }
});