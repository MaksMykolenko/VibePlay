const canvas = document.querySelector('#game');
const context = canvas.getContext('2d');
const scoreNode = document.querySelector('#score');
let score = 0;
let orb = { x: 0, y: 0, radius: 24 };

function resize() {
  canvas.width = Math.max(320, window.innerWidth * window.devicePixelRatio);
  canvas.height = Math.max(180, window.innerHeight * window.devicePixelRatio);
  context.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  moveOrb();
}

function moveOrb() {
  const width = canvas.width / window.devicePixelRatio;
  const height = canvas.height / window.devicePixelRatio;
  orb = {
    x: 50 + Math.random() * Math.max(1, width - 100),
    y: 70 + Math.random() * Math.max(1, height - 120),
    radius: 22,
  };
}

function draw() {
  const width = canvas.width / window.devicePixelRatio;
  const height = canvas.height / window.devicePixelRatio;
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#070912');
  gradient.addColorStop(1, '#29172f');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.beginPath();
  context.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
  context.fillStyle = '#f6b17a';
  context.shadowColor = '#f6b17a';
  context.shadowBlur = 24;
  context.fill();
  context.shadowBlur = 0;

  context.fillStyle = '#d9dcec';
  context.font = '16px system-ui';
  context.fillText('Click the glowing orb', 16, height - 20);
  requestAnimationFrame(draw);
}

canvas.addEventListener('pointerdown', (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  if (Math.hypot(x - orb.x, y - orb.y) <= orb.radius + 8) {
    score += 1;
    scoreNode.textContent = String(score);
    moveOrb();
  }
});

window.addEventListener('resize', resize);
window.VibePlay?.playStarted();
resize();
draw();
