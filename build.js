const fs = require('fs');
const es = require('esbuild');

fs.copyFileSync('src/test.html', 'public/index.html');

es.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    sourcemap: true,
    //outdir: 'public',
    outfile: 'public/index.js'
}).catch(() => process.exit());