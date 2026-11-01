// Turns dist/index.html into dist/artifact.html: the same game without the outer
// <html>/<head>/<body> wrapper, for publishing as a claude.ai artifact (which adds its own).
import { readFileSync, writeFileSync } from 'node:fs';
const html = readFileSync('dist/index.html', 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta charset[^>]*>/, '')
  .replace(/<meta name="viewport"[^>]*>/, '');
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
writeFileSync('dist/artifact.html', head.trim() + '\n' + body.trim() + '\n');
console.log('dist/artifact.html written');
