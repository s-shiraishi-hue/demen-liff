// 携帯の入口用の写し（2026-11-26。元は PC の業務管理の map3d.js。地球・細かい画像は使わない＝M3D_LITE）
// ホームの立体地図。地形は国土地理院の標高タイルから tools/make_map3d.ps1 で作った画像を使う
(function () {
  const B = { w: 129.95, e: 131.30, n: 34.10, s: 33.20 };
  const merc = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  const WIDTH = 100, DEPTH = 100 * (merc(B.n) - merc(B.s)) * (180 / Math.PI) / (B.e - B.w);
  const toX = lng => (lng - B.w) / (B.e - B.w) * WIDTH - WIDTH / 2;
  const toZ = lat => (merc(B.n) - merc(lat)) / (merc(B.n) - merc(B.s)) * DEPTH - DEPTH / 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const EXAGGERATE = 3.4;
  // 地球：今の地図を接平面として、同じ縮尺の球を足もとに置く。だから寄ると地図へそのままつながる
  const MAX_DIST = window.M3D_LITE ? 120 : 26000, EARTH_DIST = 15500;
  const RAD = Math.PI / 180;
  const LAT0 = 2 * Math.atan(Math.exp((merc(B.n) + merc(B.s)) / 2)) - Math.PI / 2, LNG0 = (B.w + B.e) / 2 * RAD;
  const EARTH_R = WIDTH / ((B.e - B.w) * RAD * Math.cos(LAT0));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // 緯度経度を、地図の中心を真上にした向きの球の点にする（x：東、y：上、z：南）
  const earthPoint = (lat, lng, r) => {
    const p = lat * RAD, l = lng * RAD, ex = Math.cos(p) * Math.cos(l), ey = Math.cos(p) * Math.sin(l), ez = Math.sin(p);
    const sp = Math.sin(LAT0), cp = Math.cos(LAT0), sl = Math.sin(LNG0), cl = Math.cos(LNG0);
    return [
      r * (-sl * ex + cl * ey),
      r * (cp * cl * ex + cp * sl * ey + sp * ez),
      -r * (-sp * cl * ex - sp * sl * ey + cp * ez),
    ];
  };
  const capGeometry = ([w, e, n, s], nx, ny) => {
    const pos = [], uv = [], idx = [], m0 = merc(s), m1 = merc(n);
    for (let j = 0; j <= ny; j++) {
      const m = m0 + (m1 - m0) * j / ny, lat = (2 * Math.atan(Math.exp(m)) - Math.PI / 2) / RAD;
      for (let i = 0; i <= nx; i++) {
        pos.push(...earthPoint(lat, w + (e - w) * i / nx, EARTH_R));
        uv.push(i / nx, j / ny);
      }
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 2, d = a + nx + 1;
      idx.push(a, b, c, a, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  };
  const GLOBE_LAYERS = window.M3D_LITE ? [] : [
    { file: 'earth.jpg', b: [-180, 180, 85.0511, -85.0511], seg: [96, 64], order: -8 },
    { file: 'japan.jpg', mapFile: 'japan_map.jpg', b: [118, 154, 48, 20], seg: [30, 30], order: -7, edge: true },
    { file: 'kyushu.jpg', mapFile: 'kyushu_map.jpg', b: [127.5, 134.5, 35, 29.5], seg: [20, 20], order: -6, edge: true },
    { file: 'kita.jpg', mapFile: 'kita_map.jpg', b: [128.8, 132.6, 34.9, 32.4], seg: [14, 14], order: -5, edge: true },
  ];
  const AIR_VERT = 'varying vec3 vN; varying vec3 vV; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }';
  const AIR_GLOW = 'uniform float op; varying vec3 vN; varying vec3 vV; void main() { float d = -dot(normalize(vN), normalize(vV)); float i = pow(clamp(d / 0.3, 0.0, 1.0), 2.0); gl_FragColor = vec4(0.35, 0.62, 1.0, i * op); }';
  const AIR_RIM = 'uniform float op; varying vec3 vN; varying vec3 vV; void main() { float f = 1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0); gl_FragColor = vec4(0.45, 0.7, 1.0, pow(f, 3.0) * 0.8 * op); }';
  const VIEWS = {
    earth: { lng: 130.64, lat: 33.74, dist: EARTH_DIST, pol: 0.98, az: -0.3 },
    all: { lng: 130.64, lat: 33.74, dist: 62, pol: 0.98, az: -0.3 },
    kita: { lng: 130.84, lat: 33.86, dist: 30, pol: 0.98, az: -0.5 },
    chiku: { lng: 130.70, lat: 33.72, dist: 24, pol: 0.98, az: -0.2 },
    iri: { lng: 130.74, lat: 33.80, dist: 30, pol: 0.98, az: -0.3 },
    fuku: { lng: 130.42, lat: 33.61, dist: 30, pol: 0.98, az: 0.28 },
  };

  function supported() {
    if (!window.THREE) return false;
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); } catch (e) { return false; }
  }

  function loadHeights(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const px = g.getImageData(0, 0, c.width, c.height).data, ys = new Float32Array(c.width * c.height);
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
          const v = px[(y * c.width + x) * 4];
          if (!v) continue;
          const t = (v - 8) / 247, meters = t * t * 1200;
          const edge = Math.min(x / c.width, 1 - x / c.width, y / c.height, 1 - y / c.height);
          const fade = clamp(edge / 0.07, 0, 1);
          ys[y * c.width + x] = (0.28 + meters / 1250 * EXAGGERATE) * fade * fade * (3 - 2 * fade);
        }
        resolve({ w: c.width, h: c.height, ys });
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  function create({ stage, plane, paused, onMove, onView, base = 'map3d/', layer = 'relief', intro = false }) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x070f2e);
    renderer.domElement.className = 'h-canvas';
    stage.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 2, 0.3, 500);
    const narrow = () => stage.clientWidth < 700;
    const viewOf = k => { const v = VIEWS[k]; return { x: toX(v.lng), z: toZ(v.lat), dist: v.dist * (narrow() ? 1.55 : 1), pol: v.pol, az: v.az }; };
    const goal = viewOf(window.M3D_START || 'all');
    const wantIntro = intro && !reduced;
    const now = reduced ? { ...goal } : wantIntro ? { ...goal, dist: viewOf('earth').dist } : { ...goal, dist: goal.dist * 1.5, pol: 0.5, az: goal.az - 0.5 };
    // 最初の読み込みだけ、地球から降りてくる。地球の画像が間に合わなければ、いつもの始まり方にする
    let introPending = wantIntro, introAnim = null, spinYaw = wantIntro ? -0.75 : 0, spinPitch = 0;
    const stopIntro = () => { introPending = false; introAnim = null; };
    let orbitOn = false;
    let heights = null, alive = true, dragging = false, touched = false, visible = true, last = 0, swayT = 0;
    const heightAt = (x, z) => {
      if (!heights) return 0;
      const u = clamp((x + WIDTH / 2) / WIDTH * (heights.w - 1), 0, heights.w - 1), v = clamp((z + DEPTH / 2) / DEPTH * (heights.h - 1), 0, heights.h - 1);
      return heights.ys[Math.round(v) * heights.w + Math.round(u)] || 0;
    };
    // ピンと地名を、地面の位置に結びつける
    const items = [...plane.querySelectorAll('[data-lng]')].map(el => {
      const x = toX(Number(el.dataset.lng)), z = toZ(Number(el.dataset.lat));
      el.style.left = '0'; el.style.top = '0';
      return { el, x, z, pos: new THREE.Vector3(x, 0, z) };
    });
    const rings = [], dots = [];
    // 見た目の切り替え。重い画像は選ばれたときに初めて読む
    const FILES = { relief: 'terrain.jpg', map: 'std.jpg', photo: 'photo.jpg' };
    const textures = {};
    let syncGlobeLook = null, material = null, mapMesh = null, layerName = layer in FILES ? layer : 'relief';
    const applyLayer = name => {
      layerName = name;
      syncGlobeLook?.();
      if (!material) return Promise.resolve();
      if (textures[name]) { material.map = textures[name]; material.color.set(0xffffff); material.needsUpdate = true; return Promise.resolve(); }
      return new Promise(resolve => {
        new THREE.TextureLoader().load(`${base}${FILES[name]}`, tex => {
          tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          textures[name] = tex;
          if (alive && layerName === name) { material.map = tex; material.color.set(0xffffff); material.needsUpdate = true; }
          resolve();
        }, undefined, () => resolve());
      });
    };
    loadHeights(`${base}height.png`).then(h => {
      if (!alive) return;
      heights = h;
      const geo = new THREE.PlaneBufferGeometry(WIDTH, DEPTH, h.w - 1, h.h - 1);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, h.ys[i] || 0);
      material = new THREE.MeshBasicMaterial({ color: 0x0c1c52, transparent: true, alphaMap: mapEdgeTexture() });
      mapMesh = new THREE.Mesh(geo, material);
      scene.add(mapMesh);
      applyLayer(layerName);
      // 今日の現場の足もとに光の輪
      items.forEach(it => {
        it.pos.y = heightAt(it.x, it.z) + 0.05;
        if (!it.el.classList.contains('is-today')) return;
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffd43d, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(it.x, it.pos.y + 0.06, it.z);
        ring.userData.phase = rings.length * 0.7;
        ring.renderOrder = 2;
        scene.add(ring);
        rings.push(ring);
        const dot = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), new THREE.MeshBasicMaterial({ color: 0xffd43d, transparent: true }));
        dot.renderOrder = 2;
        dot.rotation.x = -Math.PI / 2;
        dot.position.set(it.x, it.pos.y + 0.07, it.z);
        scene.add(dot);
        dots.push(dot);
      });
    }).catch(() => { /* 高さが読めなくても平らな板のまま動かす */ });

    // 地球。奥行きを使わず、塗る順番で重ねる（裏側は面の向きで消える）
    const globe = new THREE.Group();
    globe.position.set(0, -EARTH_R - 0.5, 0);
    globe.visible = false;
    scene.add(globe);
    const quiet = { transparent: true, depthTest: false, depthWrite: false };
    const globeBase = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R * 0.999, 64, 48), new THREE.MeshBasicMaterial({ ...quiet, color: 0x07246a }));
    globeBase.renderOrder = -9;
    globe.add(globeBase);
    const airMat = (frag, side) => new THREE.ShaderMaterial({ vertexShader: AIR_VERT, fragmentShader: frag, uniforms: { op: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R * 1.05, 64, 48), airMat(AIR_GLOW, THREE.BackSide));
    glow.renderOrder = -10;
    globe.add(glow);
    const rim = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R * 1.0005, 64, 48), airMat(AIR_RIM, THREE.FrontSide));
    rim.renderOrder = -3;
    globe.add(rim);
    const starPos = [];
    for (let i = 0; i < 1800; i++) {
      const y = Math.random() * 2 - 1, r = Math.sqrt(1 - y * y), a = Math.random() * Math.PI * 2;
      starPos.push(r * Math.cos(a), y, r * Math.sin(a));
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ ...quiet, color: 0xffffff, size: 1.4, sizeAttenuation: false, opacity: 0 }));
    stars.renderOrder = -20;
    stars.frustumCulled = false;
    stars.visible = false;
    scene.add(stars);
    const POLE = new THREE.Vector3(0, Math.sin(LAT0), -Math.cos(LAT0)).normalize(), AXIS_X = new THREE.Vector3(1, 0, 0);
    const qYaw = new THREE.Quaternion(), qPitch = new THREE.Quaternion(), clearColor = new THREE.Color(), BG_NEAR = new THREE.Color(0x070f2e), BG_FAR = new THREE.Color(0x01030a);
    const globeLayers = [], globeTextures = [], uRelief = { value: 0 };
    let earthLayer = null;
    syncGlobeLook = () => {
      globeLayers.forEach(l => {
        if (!l.def.mapFile) return;
        if (layerName !== 'map') { if (l.mat.map !== l.photo) { l.mat.map = l.photo; l.mat.needsUpdate = true; } return; }
        if (l.mapTex) { if (l.mat.map !== l.mapTex) { l.mat.map = l.mapTex; l.mat.needsUpdate = true; } return; }
        if (l.mapLoading) return;
        l.mapLoading = true;
        new THREE.TextureLoader().load(`${base}${l.def.mapFile}`, tex => {
          if (!alive) { tex.dispose(); return; }
          tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          globeTextures.push(tex);
          l.mapTex = tex;
          syncGlobeLook();
        });
      });
    };
    let globeReady = null;
    const ensureGlobe = () => {
      if (globeReady) return globeReady;
      const loads = GLOBE_LAYERS.map(def => new Promise(resolve => {
        new THREE.TextureLoader().load(`${base}${def.file}`, tex => {
          if (!alive) { tex.dispose(); return resolve(); }
          tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          globeTextures.push(tex);
          const mat = new THREE.MeshBasicMaterial({ ...quiet, map: tex, opacity: 0 });
          if (def.edge) mat.alphaMap = edgeTexture();
          mat.onBeforeCompile = shader => {
            shader.uniforms.uRelief = uRelief;
            shader.fragmentShader = `uniform float uRelief;\n${shader.fragmentShader}`.replace('#include <map_fragment>', `#include <map_fragment>
              float luma = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.07, 0.22) + pow(luma, 1.2) * vec3(0.5, 0.78, 1.5), uRelief);`);
          };
          const mesh = new THREE.Mesh(capGeometry(def.b, def.seg[0], def.seg[1]), mat);
          mesh.renderOrder = def.order;
          globe.add(mesh);
          const entry = { def, mat, photo: tex, mapTex: null, fade: wantIntro && def.file === 'earth.jpg' ? 1 : 0 };
          if (def.file === 'earth.jpg') earthLayer = entry;
          globeLayers.push(entry);
          syncGlobeLook();
          resolve();
        }, undefined, () => resolve());
      }));
      globeReady = loads[0];
      return globeReady;
    };
    if (GLOBE_LAYERS.length) ensureGlobe();
    if (wantIntro) {
      ensureGlobe().then(() => { if (alive && introPending) { introPending = false; introAnim = { from: now.dist, dur: 2600, spin: spinYaw, t0: null }; } });
      setTimeout(() => { if (introPending) { introPending = false; Object.assign(now, { dist: goal.dist * 1.5, pol: 0.5, az: goal.az - 0.5 }); spinYaw = 0; } }, 1800);
    }

    const resize = () => {
      const w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // 上に重なる文字（日付・一行・数字）の帯をよけて、その下の空いた所に地図の中心を置く。
      // 現場は地図の北側に集まっているので、南の端（現場のない所）が少し切れるのは構わない。ピンの札が文字の下に隠れないように
      const over = stage.parentElement?.querySelector('.h-over');
      // スマホの幅は、もともと文字の下に地図が入る距離にしてあるので、ずらさない
      const top = w < 700 ? 0 : Math.min(h * 0.4, over ? over.offsetHeight : 0);
      if (top) camera.setViewOffset(w, h, 0, -top * 0.75, w, h); else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    resize();
    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0 });
    io.observe(stage);

    let px = 0, py = 0, moved = 0, pointerKind = '';
    const raycaster = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitPoint = new THREE.Vector3();
    // 操作はグーグルマップと同じ：左ドラッグで移動、右ドラッグかCtrl+ドラッグで回転、ホイールで寄る・離れる、ダブルクリックで寄る
    let dragMode = 'pan';
    const onDown = e => {
      if ((e.button !== 0 && e.button !== 2) || e.target.closest('[data-pin], #h-card, a, button')) return;
      stopIntro();
      dragging = true; touched = true; moved = 0; px = e.clientX; py = e.clientY; pointerKind = e.pointerType;
      dragMode = e.button === 2 || e.ctrlKey || e.metaKey ? 'rotate' : 'pan';
      stage.classList.add('is-grabbing');
    };
    const onPointerMove = e => {
      if (!dragging) return;
      const dx = e.clientX - px, dy = e.clientY - py;
      px = e.clientX; py = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
      if (now.dist > 900) {
        // 地球が見えているときは、つかんで回す
        const step = Math.min(0.01, 2 * now.dist * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, stage.clientHeight) / EARTH_R);
        spinYaw += dx * step;
        spinPitch = clamp(spinPitch + dy * step, -1.3, 1.3);
      } else if (dragMode === 'rotate') {
        goal.az -= dx * 0.005;
        goal.pol = clamp(goal.pol - dy * 0.004, 0.25, 1.32);
        now.az = goal.az; now.pol = goal.pol;
      } else {
        const unit = 2 * now.dist * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, stage.clientHeight);
        const sinA = Math.sin(now.az), cosA = Math.cos(now.az), depth = 1 / Math.max(0.35, Math.cos(now.pol));
        const rx = cosA, rz = -sinA, fx = -sinA, fz = -cosA;
        goal.x = clamp(goal.x - rx * dx * unit + fx * dy * unit * depth, -WIDTH / 2, WIDTH / 2);
        goal.z = clamp(goal.z - rz * dx * unit + fz * dy * unit * depth, -DEPTH / 2, DEPTH / 2);
        now.x = goal.x; now.z = goal.z;
      }
      if (moved > 4) { onMove?.(); onView?.(); }
    };
    const onUp = () => { dragging = false; stage.classList.remove('is-grabbing'); };
    const pointHit = e => {
      const r = stage.getBoundingClientRect();
      raycaster.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, camera);
      return raycaster.ray.intersectPlane(groundPlane, hitPoint);
    };
    // 地図より遠くは一度に大きく動かす。地球まで何回も回さなくて済むように
    const stepOf = factor => (goal.dist > 150 ? Math.pow(factor, 2.4) : factor);
    const zoomAtPointer = (e, factor) => {
      stopIntro();
      const next = clamp(goal.dist * stepOf(factor), 2.2, MAX_DIST), f = next / goal.dist;
      if (next < 150 && pointHit(e)) {
        goal.x = clamp(hitPoint.x + (goal.x - hitPoint.x) * f, -WIDTH / 2, WIDTH / 2);
        goal.z = clamp(hitPoint.z + (goal.z - hitPoint.z) * f, -DEPTH / 2, DEPTH / 2);
      }
      goal.dist = next;
      touched = true;
      onMove?.(); onView?.();
    };
    const onContext = e => { if (!e.target.closest('#h-card, a')) e.preventDefault(); };
    const onWheel = e => {
      if (e.target.closest('#h-card')) return;
      e.preventDefault();
      zoomAtPointer(e, Math.pow(1.0016, clamp(e.deltaY, -300, 300)));
    };
    const onDbl = e => { if (!e.target.closest('[data-pin], #h-card, a, button')) zoomAtPointer(e, e.shiftKey ? 1.8 : 0.55); };
    stage.addEventListener('contextmenu', onContext);
    stage.addEventListener('dblclick', onDbl);
    stage.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    stage.addEventListener('wheel', onWheel, { passive: false });

    const v3 = new THREE.Vector3();
    const place = (w, h) => {
      items.forEach(it => {
        v3.copy(it.pos).project(camera);
        const out = v3.z > 1 || v3.x < -1.05 || v3.x > 1.05 || v3.y < -1.05 || v3.y > 1.05;
        if (out !== it.out) { it.el.style.visibility = out ? 'hidden' : 'visible'; it.out = out; }
        if (out) return;
        it.el.style.transform = `translate3d(${((v3.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v3.y) / 2 * h).toFixed(1)}px, 0)`;
        it.el.style.zIndex = String(1000 - Math.round(v3.z * 1000) + (it.el.classList.contains('is-today') ? 200 : 0));
      });
    };
    // 工事名どうしが重ならないよう、手前から順に棒を伸ばして上へずらす
    const declutter = () => {
      const stageRect = stage.getBoundingClientRect(), placed = [];
      const today = items.filter(it => it.el.classList.contains('is-today') && !it.out).map(it => {
        const m = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(it.el.style.transform) || [];
        const head = it.el.querySelector('.h-pin-head');
        // 棒は長くしすぎない（人数は札に書いてある）
        if (it.baseH == null) it.baseH = Math.min(46, parseFloat(it.el.style.getPropertyValue('--h')) || 30);
        return { it, x: Number(m[1]), y: Number(m[2]), w: head.offsetWidth, h: head.offsetHeight };
      }).sort((a, b) => b.y - a.y);
      // 札は、上の文字の帯より下に置く。重なるときは上へ積むだけでなく、横にもずらして、高く伸びすぎないようにする
      const over = stage.parentElement?.querySelector('.h-over');
      const minTop = stage.clientWidth >= 700 && over ? Math.min(stage.clientHeight * 0.4, over.offsetHeight) - 6 : 4;
      today.forEach(p => {
        const fits = (lift, dx) => {
          const top = p.y - p.it.baseH - lift - p.h - 4, bottom = top + p.h + 4, left = p.x + dx - p.w / 2 - 10, right = p.x + dx + p.w / 2 + 10;
          if (left < 4 || right > stage.clientWidth - 4) return null;
          return placed.some(q => left < q.right && right > q.left && top < q.bottom && bottom > q.top) ? null : { left, right, top, bottom };
        };
        const rowH = p.h + 6, shifts = [0];
        for (let k = 1; k <= 9; k++) shifts.push(k * 36, -k * 36);
        let best = null;
        // まず横のずれが小さい所から。上の段は、文字の帯にかからない所までしか使わない
        for (const dx of shifts) {
          for (let n = 0; n < 6; n++) {
            const box = fits(n * rowH, dx);
            if (box && (box.top >= minTop || n === 0)) { best = { lift: n * rowH, dx, box }; break; }
            if (box && box.top < minTop) break;
          }
          if (best) break;
        }
        if (!best) best = { lift: 0, dx: 0, box: null };
        if (best.box) placed.push(best.box);
        p.it.lift = (p.it.lift ?? best.lift) + (best.lift - (p.it.lift ?? best.lift)) * 0.35;
        p.it.dx = (p.it.dx ?? best.dx) + (best.dx - (p.it.dx ?? best.dx)) * 0.35;
        const s = p.it.el.style, gap = Math.max(0, Math.abs(p.it.dx) - p.w / 2);
        s.setProperty('--h', `${(p.it.baseH + p.it.lift).toFixed(1)}px`);
        s.setProperty('--dx', `${p.it.dx.toFixed(1)}px`);
        s.setProperty('--lk', `${gap.toFixed(1)}px`);
        s.setProperty('--lkl', `${(p.it.dx < 0 ? -gap : 0).toFixed(1)}px`);
      });
      // 今日の現場でなくなったピンは、横のずれを戻す
      items.forEach(it => { if (it.dx && !it.el.classList.contains('is-today')) { it.dx = 0; it.lift = 0; it.el.style.removeProperty('--dx'); it.el.style.removeProperty('--lk'); } });
      // 小さい工事名は、ぶつかるものだけ隠す。乗せると出る
      items.forEach(it => {
        if (!it.el.dataset.pin || it.el.classList.contains('is-today')) return;
        if (it.out) return;
        const m = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(it.el.style.transform) || [];
        const name = it.el.querySelector('.h-pin-name');
        if (!name) return;
        if (it.nameW == null) it.nameW = name.offsetWidth || name.textContent.length * 10 + 14;
        const x = Number(m[1]), y = Number(m[2]), left = x - it.nameW / 2, right = x + it.nameW / 2, top = y - 48, bottom = y - 30;
        const hit = placed.some(q => left < q.right && right > q.left && top < q.bottom && bottom > q.top);
        if (!hit) placed.push({ left, right, top, bottom });
        if (hit !== it.hideName) { it.el.classList.toggle('no-name', hit); it.hideName = hit; }
      });
      return stageRect;
    };
    let groundY = 0;
    // 現場のまわりだけ細かい画像を重ねる。寄ったときに近くの分だけ読む
    const patches = (window.MAP_PATCHES || []).map((b, id) => ({ id, b, cx: toX((b[0] + b[1]) / 2), cz: toZ((b[2] + b[3]) / 2), meshes: {} }));
    const patchTextures = [];
    let patchLoading = 0, patchTick = 0, edgeMap = null;
    const heightSmooth = (x, z) => {
      if (!heights) return 0;
      const u = clamp((x + WIDTH / 2) / WIDTH * (heights.w - 1), 0, heights.w - 1.001), v = clamp((z + DEPTH / 2) / DEPTH * (heights.h - 1), 0, heights.h - 1.001);
      const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, at = (a, b) => heights.ys[b * heights.w + a] || 0;
      return (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fv) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fv;
    };
    const edgeTexture = () => {
      if (edgeMap) return edgeMap;
      const c = document.createElement('canvas'), S = 128;
      c.width = c.height = S;
      const g = c.getContext('2d'), im = g.createImageData(S, S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const e = Math.min(x, S - 1 - x, y, S - 1 - y) / (S * 0.1), a = Math.round(clamp(e, 0, 1) * 255), o = (y * S + x) * 4;
        im.data[o] = im.data[o + 1] = im.data[o + 2] = a; im.data[o + 3] = 255;
      }
      g.putImageData(im, 0, 0);
      edgeMap = new THREE.CanvasTexture(c);
      return edgeMap;
    };
    let mapEdge = null;
    const mapEdgeTexture = () => {
      if (mapEdge) return mapEdge;
      const c = document.createElement('canvas'), S = 256;
      c.width = c.height = S;
      const g = c.getContext('2d'), im = g.createImageData(S, S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const a = Math.round(smooth(0.075, 0.2, Math.min(x, S - 1 - x, y, S - 1 - y) / S) * 255), o = (y * S + x) * 4;
        im.data[o] = im.data[o + 1] = im.data[o + 2] = a; im.data[o + 3] = 255;
      }
      g.putImageData(im, 0, 0);
      mapEdge = new THREE.CanvasTexture(c);
      return mapEdge;
    };
    const buildPatch = (p, name) => {
      const x0 = toX(p.b[0]), x1 = toX(p.b[1]), z0 = toZ(p.b[2]), z1 = toZ(p.b[3]), SEG = 28;
      const geo = new THREE.PlaneBufferGeometry(x1 - x0, z1 - z0, SEG, SEG);
      geo.rotateX(-Math.PI / 2);
      geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, heightSmooth(pos.getX(i), pos.getZ(i)) + 0.05);
      const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, alphaMap: edgeTexture(), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 1;
      scene.add(mesh);
      patchLoading++;
      new THREE.TextureLoader().load(`${base}p/${p.id}_${name}.jpg`, tex => {
        patchLoading--;
        tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        patchTextures.push(tex);
        if (!alive) return;
        mat.map = tex;
        mat.needsUpdate = true;
        mesh.userData.ready = true;
      }, undefined, () => { patchLoading--; });
      return mesh;
    };
    const updatePatches = () => {
      const on = layerName !== 'relief' && heights && now.dist < 32, near = 5 + now.dist * 0.6;
      const opacity = clamp((32 - now.dist) / 10, 0, 1);
      patches.forEach(p => {
        const close = on && Math.hypot(p.cx - now.x, p.cz - now.z) < near;
        if (close && !p.meshes[layerName] && patchLoading < 4) p.meshes[layerName] = buildPatch(p, layerName);
        Object.entries(p.meshes).forEach(([name, m]) => {
          m.visible = close && name === layerName && m.userData.ready;
          m.material.opacity = opacity;
        });
      });
    };
    const frame = t => {
      if (!alive) return;
      if (!stage.isConnected) { destroy(); return; }
      requestAnimationFrame(frame);
      if (!visible) return;
      const dt = Math.min(0.1, (t - last) / 1000 || 0.016);
      last = t;
      const hold = paused?.() || dragging;
      // 入口の［回る］：触っていない間、ぐるっと回り続ける（11/26）
      if (orbitOn && !dragging) goal.az += dt * 0.07;
      const ease = reduced ? 1 : 1 - Math.pow(0.02, dt);
      if (introAnim) {
        if (introAnim.t0 == null) introAnim.t0 = t;
        const p = clamp((t - introAnim.t0) / introAnim.dur, 0, 1), e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        now.dist = Math.exp(Math.log(introAnim.from) + (Math.log(goal.dist) - Math.log(introAnim.from)) * e);
        spinYaw = introAnim.spin * (1 - e);
        if (p >= 1) introAnim = null;
      } else if (!introPending) {
        ['x', 'z', 'pol', 'az'].forEach(k => { now[k] += (goal[k] - now[k]) * ease; });
        now.dist = Math.exp(Math.log(now.dist) + (Math.log(goal.dist) - Math.log(now.dist)) * ease);
      }
      // 遠くなるほど、地球の真上から見る形へ移す。寄れば元の見方に戻る
      const space = smooth(200, 1500, now.dist), keep = 1 - space;
      if (space >= 1 && !hold && !introAnim && !introPending && !reduced) spinYaw += dt * 0.05;
      if (space <= 0 && !introAnim && !introPending) { spinYaw = 0; spinPitch = 0; }
      if (goal.dist < 900 && !introAnim && !introPending) { const back = Math.min(1, ease * 2.5); spinYaw -= spinYaw * back; spinPitch -= spinPitch * back; }
      spinYaw = ((spinYaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      // 触っていないときはゆっくり揺らす
      if (!hold && !reduced && !touched) swayT += dt;
      const sway = reduced ? 0 : Math.sin(swayT * 0.12) * 0.09;
      const pol = now.pol + (0.02 - now.pol) * space, az = (now.az + sway) * keep, sinP = Math.sin(pol), cosP = Math.cos(pol);
      groundY += (heightAt(now.x, now.z) - groundY) * ease;
      const tx = now.x * keep, tz = now.z * keep, ty = groundY * keep;
      camera.position.set(tx + now.dist * sinP * Math.sin(az), ty + now.dist * cosP, tz + now.dist * sinP * Math.cos(az));
      camera.lookAt(tx, ty, tz);
      camera.near = Math.max(0.3, now.dist * 0.02);
      camera.far = now.dist + EARTH_R * 2.2;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      // 地図から地球へ入れ替える
      const mapOn = 1 - smooth(110, 175, now.dist), air = smooth(400, 1500, now.dist), starOn = smooth(400, 2500, now.dist);
      renderer.setClearColor(clearColor.copy(BG_NEAR).lerp(BG_FAR, smooth(150, 2500, now.dist)));
      if (material) { material.opacity = mapOn; mapMesh.visible = mapOn > 0; }
      rings.concat(dots).forEach(o => { o.visible = mapOn > 0.6; });
      globe.visible = !!earthLayer;
      if (globe.visible) {
        uRelief.value = (layerName === 'relief' ? 1 : 0) * (1 - smooth(150, 700, now.dist));
        qYaw.setFromAxisAngle(POLE, spinYaw * space);
        qPitch.setFromAxisAngle(AXIS_X, spinPitch * space);
        globe.quaternion.copy(qPitch).multiply(qYaw);
        globeBase.material.opacity = earthLayer.fade;
        glow.material.uniforms.op.value = air;
        rim.material.uniforms.op.value = air;
        globeLayers.forEach(l => { l.fade = Math.min(1, l.fade + dt * 3); l.mat.opacity = l.fade; });
      }
      stars.visible = starOn > 0;
      if (stars.visible) { stars.position.copy(camera.position); stars.scale.setScalar(camera.far * 0.8); stars.material.opacity = starOn; }
      stage.classList.toggle('is-space', now.dist > 125);
      { const k = clamp(now.dist / 62, 0.12, 1.3); dots.forEach(o => o.scale.set(k, k, k)); }
      rings.forEach(r => {
        const k = reduced ? 0.6 : ((t / 2600 + r.userData.phase) % 1);
        const s = (0.8 + k * 2.2) * clamp(now.dist / 62, 0.12, 1.3);
        r.scale.set(s, s, s);
        r.material.opacity = reduced ? 0.6 : (1 - k) * 0.85;
      });
      stage.classList.toggle('is-near', now.dist < 42);
      if (patches.length && !(patchTick++ % 8)) updatePatches();
      renderer.render(scene, camera);
      if (now.dist < 160) { place(stage.clientWidth, stage.clientHeight); declutter(); }
    };
    requestAnimationFrame(frame);

    function destroy() {
      alive = false;
      ro.disconnect(); io.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      scene.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
      Object.values(textures).forEach(tex => tex.dispose());
      patchTextures.forEach(tex => tex.dispose());
      globeTextures.forEach(tex => tex.dispose());
      edgeMap?.dispose();
      mapEdge?.dispose();
      renderer.dispose();
    }
    return {
      flyTo(name) { stopIntro(); Object.assign(goal, viewOf(name)); touched = name !== 'all'; if (name === 'all') swayT = 0; },
      zoom(f) { stopIntro(); goal.dist = clamp(goal.dist * stepOf(f), 2.2, MAX_DIST); touched = true; },
      setLayer: applyLayer,
      orbit(on) { orbitOn = !!on; touched = true; },
      destroy,
    };
  }
  window.Map3D = { supported, create };
})();
