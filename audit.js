const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const issues = [];
const allFiles = [];
const importedFiles = new Set();

// Walk all source files
function walk(dir) {
  fs.readdirSync(dir).forEach(f => {
    const p = path.join(dir, f);
    const stat = fs.statSync(p);
    if (stat.isDirectory() && !['node_modules','dist','.git'].includes(f)) walk(p);
    else if (/\.(jsx?|tsx?)$/.test(f)) allFiles.push(p);
  });
}
walk(SRC);

// Parse each file for relative imports
allFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    const m = line.match(/from\s+['"](\.\.?\/[^'"]+)['"]/);
    if (!m) return;
    const imp = m[1];
    const base = path.resolve(path.dirname(file), imp);
    const candidates = [base, base+'.js', base+'.jsx', base+'.ts', base+'.tsx',
                        path.join(base,'index.js'), path.join(base,'index.jsx')];
    const found = candidates.find(c => fs.existsSync(c));
    if (found) {
      importedFiles.add(found);
    } else {
      issues.push({ type: 'BROKEN_IMPORT', file: file.replace(__dirname+path.sep,''), line: i+1, import: imp });
    }
  });
});

// Find unused files (not imported anywhere, not entry points)
const entryPoints = ['main.jsx','main.tsx','App.jsx','App.tsx'].map(e => path.join(SRC, e));
allFiles.forEach(f => {
  if (entryPoints.includes(f)) return;
  if (!importedFiles.has(f)) {
    issues.push({ type: 'UNUSED_FILE', file: f.replace(__dirname+path.sep,'') });
  }
});

console.log('\n=== IMPORT AUDIT ===\n');
const broken = issues.filter(i => i.type === 'BROKEN_IMPORT');
const unused = issues.filter(i => i.type === 'UNUSED_FILE');

if (broken.length === 0) {
  console.log('OK  All relative imports resolve correctly.');
} else {
  broken.forEach(b => console.log('ERR Broken import in ' + b.file + ':' + b.line + '  -> ' + b.import));
}

console.log('');
if (unused.length === 0) {
  console.log('OK  No unused source files found.');
} else {
  unused.forEach(u => console.log('INF Unused file: ' + u.file));
}

console.log('\n=== COMPONENT LINKAGE ===\n');
const components = ['App.jsx','BatchStudio.jsx','SlideSlicerPanel.jsx','InstagramPanel.jsx','ui.jsx'];
components.forEach(c => {
  const p = allFiles.find(f => f.endsWith(c));
  if (!p) { console.log('MISSING: '+c); return; }
  const isImported = importedFiles.has(p);
  const isEntry = entryPoints.includes(p);
  console.log((isImported||isEntry ? 'OK ' : 'INF') + '  ' + c + (isImported ? ' (imported)' : isEntry ? ' (entry)' : ' (not imported - dead code?)'));
});

console.log('\nDone.\n');
