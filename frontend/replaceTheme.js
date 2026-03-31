const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
  });
}

walk(srcDir, function(filePath) {
  if (filePath.endsWith('.jsx') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Global replacement maps
    content = content.replace(/text-white/g, 'text-slate-900')
                     .replace(/text-slate-400/g, 'text-slate-600')
                     .replace(/text-slate-300/g, 'text-slate-700')
                     .replace(/text-slate-200/g, 'text-slate-800')
                     .replace(/text-slate-500/g, 'text-slate-500')
                     .replace(/bg-slate-900/g, 'bg-slate-50')
                     .replace(/bg-slate-800/g, 'bg-white')
                     .replace(/bg-slate-700/g, 'bg-slate-200')
                     .replace(/border-slate-700/g, 'border-slate-300')
                     .replace(/border-slate-800/g, 'border-slate-200')
                     .replace(/bg-slate-900\/(\d+)/g, 'bg-slate-50/$1')
                     .replace(/bg-slate-800\/(\d+)/g, 'bg-white/$1')
                     .replace(/border-slate-700\/(\d+)/g, 'border-slate-300/$1');

    fs.writeFileSync(filePath, content, 'utf8');
  }
});
console.log("Replacements complete.");
