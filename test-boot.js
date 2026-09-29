const { spawn } = require('child_process');
const p = spawn('node', ['src/cli.js']);
p.stdout.on('data', d => console.log(d.toString()));
p.stderr.on('data', d => console.error(d.toString()));
p.stdin.write('Admin\nadmin\n123456\nadmin\n123456\n0\n');
