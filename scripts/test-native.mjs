import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = mkdtempSync(join(tmpdir(),'supaclip-rust-'));
try {
 const binary = join(dir,'native-tests');
 const compile = spawnSync('rustc',['--edition=2021','--test','src-tauri/src/media.rs','-o',binary],{stdio:'inherit'});
 if(compile.status!==0) process.exitCode=1;
 else process.exitCode=spawnSync(binary,['--nocapture'],{stdio:'inherit'}).status ?? 1;
} finally { rmSync(dir,{recursive:true,force:true}); }
