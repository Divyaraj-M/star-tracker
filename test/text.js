// Unit tests for the activity text helpers: node test/text.js
const esbuild=require('esbuild');const assert=require('assert');
const code=esbuild.buildSync({entryPoints:[__dirname+'/../src/activity/text.ts'],bundle:true,format:'cjs',write:false}).outputFiles[0].text;
const m={exports:{}};new Function('module','exports',code)(m,m.exports);const T=m.exports;
let n=0;const ok=(c,msg)=>{assert.ok(c,msg);n++};
// excerpt skips frontmatter and markdown syntax
ok(T.excerpt('---\na: 1\n---\n# Title\nSee [[Note|the note]] and [link](http://x).')==='Title\nSee the note and link.','excerpt');
// diff finds changed block
let d=T.lineDiff('a\nb\nc','a\nB\nc');ok(d.changed===1&&d.preview==='B','diff change');
d=T.lineDiff('a\nb\nc','a\nc');ok(d.preview==='Removed: b','diff removal');
d=T.lineDiff('a','a\n- new item');ok(d.preview==='new item'&&d.changed===1,'diff add');
// checkbox changes
let c=T.checkboxChanges('- [ ] one\n- [ ] two\n- [x] three','- [x] one ✅ 2026-10-08\n- [-] two\n- [x] three');
ok(c.length===2&&c[0].text==='one'&&c[0].done&&c[1].text==='two'&&!c[1].done,'checkboxes');
ok(T.checkboxChanges('- [ ] a','- [ ] a\n- [x] b').length===0,'new checked line is not a completion');
// tracker-only frontmatter writes
ok(T.onlyKeysChanged('---\nstatus: A\nowner: x\n---\nbody','---\nstatus: B\nowner: x\nstatus_log:\n  - 2026-10-08 | A → B\n---\nbody',['status','status_log']),'tracker keys ignored');
ok(!T.onlyKeysChanged('---\nstatus: A\nowner: x\n---\nbody','---\nstatus: A\nowner: y\n---\nbody',['status']),'other key counts');
ok(!T.onlyKeysChanged('---\nstatus: A\n---\nbody','---\nstatus: B\n---\nbody 2',['status']),'body counts');
console.log(`text helpers: ${n} checks passed`);
