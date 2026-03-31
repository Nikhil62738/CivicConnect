const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    fs.statSync(dirPath).isDirectory() ? walk(dirPath, callback) : callback(dirPath);
  });
}

walk(srcDir, function(filePath) {
  if (filePath.endsWith('.jsx')) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Make text white if preceeded by dark background
    content = content.replace(/(bg-primary[^'"`}]*?)text-slate-(900|800)/g, '$1text-white');
    content = content.replace(/(bg-indigo-500[^'"`}]*?)text-slate-(900|800)/g, '$1text-white');
    content = content.replace(/(bg-amber-500[^'"`}]*?)text-slate-(900|800)/g, '$1text-white');
    content = content.replace(/(bg-emerald-500[^'"`}]*?)text-slate-(900|800)/g, '$1text-white');
    
    // Make text white if preceeding a dark background (order doesn't matter in tailwind class strings)
    content = content.replace(/text-slate-(900|800)([^'"`}]*?bg-primary)/g, 'text-white$2');
    content = content.replace(/text-slate-(900|800)([^'"`}]*?bg-indigo-500)/g, 'text-white$2');
    content = content.replace(/text-slate-(900|800)([^'"`}]*?bg-amber-500)/g, 'text-white$2');

    fs.writeFileSync(filePath, content, 'utf8');
  }
});
console.log("Contrast issues fixed.");
