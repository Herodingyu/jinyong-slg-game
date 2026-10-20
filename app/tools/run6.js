// 连跑6次冒烟测试确认 engine 修复后全绿
const { execSync } = require('child_process');
let pass = 0;
for (let i = 1; i <= 6; i++) {
  try {
    const out = execSync('node tools/test_fx_b1.js', { encoding: 'utf8', timeout: 60000 });
    pass++; console.log(`run${i}: PASS`);
  } catch (e) {
    const failLine = String(e.stdout || '').trim().split('\n').filter(l => /FAIL/.test(l)).pop();
    console.log(`run${i}: ${failLine || 'FAIL(异常)'}`);
  }
}
console.log(`${pass}/6 PASS`);
