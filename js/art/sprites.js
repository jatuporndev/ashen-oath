// Sprite Animation System — directional sprite-sheet actors rendered as camera-facing
// billboards. Picks the front / side / back view from the actor's facing relative to the
// camera (mirroring the side view), drives frame UVs, and carries weapon pivots at the
// painted hand positions so weapons can be swung procedurally.
(function () {
  'use strict';
  const EW = (window.EW = window.EW || {});
  const unitPlane = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const centerPlane = new THREE.PlaneGeometry(1, 1);

  class DirectionalSprite {
    constructor({ sheet, cols, rows, frameW, frameH, height, views, poses }) {
      this.cols = cols; this.rows = rows; this.views = views; this.poses = poses;
      this.hands = sheet.hands; this.frameW = frameW; this.frameH = frameH;
      this.h = height; this.w = height * (frameW / frameH);
      this.root = new THREE.Group();
      this.bb = new THREE.Group(); this.bb.rotation.order = 'YXZ';
      this.roll = new THREE.Group(); // pivot at mid-height for dodge rolls
      this.roll.position.y = this.h * 0.42;
      this.bb.add(this.roll);
      this.root.add(this.bb);
      this.tex = new THREE.CanvasTexture(this.pixSheet(sheet.canvas));
      this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.repeat.set(1 / cols, 1 / rows);
      this.tex.anisotropy = 8; EW.engine.nearest(this.tex);
      this.mat = new THREE.MeshBasicMaterial({ map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide });
      this.body = new THREE.Mesh(unitPlane, this.mat);
      this.body.scale.set(this.w, this.h, 1); this.body.position.y = -this.h * 0.42;
      this.roll.add(this.body);
      this.main = new THREE.Group(); this.off = new THREE.Group();
      this.roll.add(this.main, this.off);
      this.view = 'side'; this.pose = poses[0]; this.flip = 1;
      this.setFrame('side', poses[0]);
    }
    pixSheet(c) { return EW.PIXEL ? window.Pixel.sheet(c, this.cols, this.rows, Math.round(this.frameW / 3), Math.round(this.frameH / 3)) : c; }
    setSheet(sheet) {
      this.tex.image = this.pixSheet(sheet.canvas); this.tex.needsUpdate = true; this.hands = sheet.hands;
      this.setFrame(this.view, this.pose, true);
    }
    // world-space facing → view + mirroring, relative to the camera yaw
    face(dx, dz, camYaw) {
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
      const l = Math.hypot(dx, dz) || 1, d = (dx * fx + dz * fz) / l, s = (dx * rx + dz * rz) / l;
      const view = d > 0.62 ? 'back' : d < -0.62 ? 'front' : 'side';
      this.flip = view === 'side' ? (s >= 0 ? 1 : -1) : 1;
      this.bb.scale.x = this.flip;
      if (view !== this.view) this.setFrame(view, this.pose);
      return view;
    }
    setFrame(view, pose, force) {
      if (!force && view === this.view && pose === this.pose) return;
      this.view = view; this.pose = pose;
      const r = this.views.indexOf(view), c = this.poses.indexOf(pose);
      this.tex.offset.set(c / this.cols, 1 - (r + 1) / this.rows);
      const hd = this.hands[view][pose];
      const toLocal = (p) => [(p[0] / this.frameW - 0.5) * this.w, (1 - p[1] / this.frameH) * this.h - this.h * 0.42];
      const m = toLocal(hd.main), o = toLocal(hd.off);
      // seen from behind, the hands (and what they hold) are on the far side of the body:
      // put them behind the sprite plane so the weapon isn't drawn pasted onto the back
      const behind = view === 'back';
      this.main.position.set(m[0], m[1], behind ? -0.06 : 0.06);
      this.off.position.set(o[0], o[1], view === 'side' || behind ? -0.06 : 0.06);
    }
    billboard(yaw, tilt) { this.bb.rotation.y = yaw; this.bb.rotation.x = tilt; }
  }
  EW.DirectionalSprite = DirectionalSprite;

  // weapon mesh whose origin sits at the painted grip
  EW.makeWeaponMesh = (w, pxPerUnit) => {
    const t = new THREE.CanvasTexture(EW.engine.pix(w.canvas, 3)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; EW.engine.nearest(t);
    const W = w.canvas.width / pxPerUnit, H = w.canvas.height / pxPerUnit;
    const g = centerPlane.clone();
    g.translate(-(w.grip[0] / w.canvas.width - 0.5) * W / W, -((1 - w.grip[1] / w.canvas.height) - 0.5) * H / H, 0);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide }));
    m.scale.set(W, H, 1);
    return m;
  };

  // simple multi-layer puppet for bosses: parts are pivots inside one camera-facing plane group
  class Puppet {
    constructor(pxu) { this.pxu = pxu; this.root = new THREE.Group(); this.bb = new THREE.Group(); this.bb.rotation.order = 'YXZ'; this.root.add(this.bb); this.views = {}; this.parts = {}; }
    // spec: { view: [{ name, art, at:[ux,uy], z, parent?, tint? }] }
    build(spec) {
      for (const [view, list] of Object.entries(spec)) {
        const g = new THREE.Group(); g.visible = false; this.bb.add(g); this.views[view] = g; this.parts[view] = {};
        for (const p of list) {
          const pivot = new THREE.Group();
          pivot.position.set(p.at[0], p.at[1], p.z || 0);
          const mesh = this.partMesh(p.art, p.tint);
          pivot.add(mesh);
          (p.parent ? this.parts[view][p.parent].pivot : g).add(pivot);
          this.parts[view][p.name] = { pivot, mesh, base: { x: p.at[0], y: p.at[1] }, art: p.art };
        }
      }
    }
    partMesh(art, tint) {
      const t = new THREE.CanvasTexture(EW.engine.pix(art.canvas, 4)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; EW.engine.nearest(t);
      const W = art.canvas.width / this.pxu, H = art.canvas.height / this.pxu;
      const g = centerPlane.clone();
      g.translate(0.5 - art.pivot[0] / art.canvas.width, (art.pivot[1] / art.canvas.height) - 0.5, 0);
      const mat = new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.4, side: THREE.DoubleSide, transparent: false });
      if (tint) mat.color.setScalar(tint);
      const m = new THREE.Mesh(g, mat); m.scale.set(W, H, 1);
      m.userData.tint = tint || 1;
      return m;
    }
    swap(view, name, art) {
      const p = this.parts[view]?.[name]; if (!p || p.art === art) return;
      p.art = art; const m = p.mesh; m.material.map.image = art.canvas; m.material.map.needsUpdate = true;
      const W = art.canvas.width / this.pxu, H = art.canvas.height / this.pxu;
      m.geometry.dispose(); m.geometry = centerPlane.clone().translate(0.5 - art.pivot[0] / art.canvas.width, (art.pivot[1] / art.canvas.height) - 0.5, 0);
      m.scale.set(W, H, 1);
    }
    show(view) { for (const [v, g] of Object.entries(this.views)) g.visible = v === view; this.view = view; }
    each(fn) { for (const v of Object.values(this.parts)) for (const p of Object.values(v)) fn(p); }
  }
  EW.Puppet = Puppet;
})();
