import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
    root: 'src',
    base: './',
    plugins: [
        viteStaticCopy({
            targets: [
                { src: 'img', dest: '' },
                { src: 'shaders',  dest: '' },
                { src: 'config',  dest: '' },
            ]
        })
    ],
    build: {
        outDir: '../build',
        emptyOutDir: true,
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