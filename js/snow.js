(function () {
  const canvas = document.getElementById("snow-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let flakes = [];
  let w, h;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  const COUNT = window.innerWidth < 720 ? 45 : 80;

  function makeFlake() {
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 2.6 + 1,
      speedY: Math.random() * 0.6 + 0.25,
      speedX: Math.random() * 0.4 - 0.2,
      drift: Math.random() * Math.PI * 2,
      opacity: Math.random() * 0.5 + 0.25,
    };
  }

  for (let i = 0; i < COUNT; i++) flakes.push(makeFlake());

  function tick() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(241, 245, 255, 1)";

    for (const f of flakes) {
      f.drift += 0.01;
      f.y += f.speedY;
      f.x += f.speedX + Math.sin(f.drift) * 0.3;

      if (f.y > h + 5) { f.y = -5; f.x = Math.random() * w; }
      if (f.x > w + 5) f.x = -5;
      if (f.x < -5) f.x = w + 5;

      ctx.globalAlpha = f.opacity;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (!prefersReducedMotion) requestAnimationFrame(tick);
  }

  if (prefersReducedMotion) {
    // Desenha um único frame estático, sem animação contínua
    tick();
  } else {
    tick();
  }
})();
