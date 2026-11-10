const { seg, eo, eio, lerp, TextFx } = kit;

kit.scene('outro', {
  init(kit) {
    kit.stage.append(kit.h(
      '<div class="ground" style="display:flex;align-items:center;justify-content:center;text-align:center">' +
        '<div class="outro-wrap" style="position:relative;display:flex;flex-direction:column;align-items:center;gap:36px;padding:40px">' +
          '<!-- Ceramic Seal Motif -->' +
          '<div class="outro-seal" style="width:180px;height:180px;border-radius:50%;background:radial-gradient(circle, color-mix(in srgb, var(--main) 20%, #FAF8F5) 0%, #FFFFFF 100%);border:4px solid var(--main);display:flex;align-items:center;justify-content:center;box-shadow:0 16px 40px rgba(156,113,86,0.18)">' +
            '<svg viewBox="0 0 100 100" style="width:100px;height:100px">' +
              '<path d="M35 75 C25 60 30 45 38 38 C42 34 40 30 42 28 L58 28 C60 30 58 34 62 38 C70 45 75 60 65 75 Z" fill="var(--main)" />' +
              '<ellipse cx="50" cy="28" rx="8" ry="3" fill="var(--accent)" />' +
              '<circle cx="50" cy="52" r="5" fill="var(--accent)" />' +
            '</svg>' +
          '</div>' +

          '<!-- Brand Name & Slogan -->' +
          '<div class="outro-text-block">' +
            '<h1 class="outro-title" style="font-family:var(--display);font-size:86px;font-weight:700;margin:0 0 16px;color:var(--second);letter-spacing:-0.02em">Tiệm Nhà Gốm</h1>' +
            '<p class="outro-slogan" style="font-family:var(--sans);font-size:32px;font-weight:600;margin:0;color:var(--main);letter-spacing:0.04em">Chạm Nét Mộc · Trọn An Yên</p>' +
          '</div>' +

          '<!-- Call To Action Button -->' +
          '<div class="outro-cta" style="margin-top:16px;background:var(--main);color:#FFFFFF;padding:18px 46px;border-radius:999px;font-family:var(--sans);font-size:24px;font-weight:700;box-shadow:0 12px 30px rgba(156,113,86,0.35);letter-spacing:0.02em">' +
            'Trải Nghiệm Ứng Dụng Ngay' +
          '</div>' +

          '<span class="outro-subtext" style="font-size:20px;color:color-mix(in srgb, var(--second) 60%, transparent);margin-top:-10px">iOS & Android · tiemnhagom.vn</span>' +
        '</div>' +
      '</div>'
    ));

    this.wrap = kit.stage.querySelector('.outro-wrap').style;
    this.seal = kit.stage.querySelector('.outro-seal').style;
    this.title = kit.stage.querySelector('.outro-title');
    this.slogan = kit.stage.querySelector('.outro-slogan').style;
    this.cta = kit.stage.querySelector('.outro-cta').style;
    this.subtext = kit.stage.querySelector('.outro-subtext').style;
  },

  render(t) {
    // Seal lands with soft bounce
    const pSeal = eo(seg(t, 0.1, 1.2));
    this.seal.opacity = pSeal;
    this.seal.transform = 'scale(' + lerp(0.6, 1.0, pSeal) + ') rotate(' + lerp(-12, 0, pSeal) + 'deg)';

    // Brand title
    TextFx.fadeFromRight(this.title, t, 0.4);

    // Slogan and CTA
    this.slogan.opacity = eo(seg(t, 0.8, 1.5));
    this.slogan.transform = 'translateY(' + lerp(20, 0, eo(seg(t, 0.8, 1.5))) + 'px)';

    const pCta = eo(seg(t, 1.4, 2.2));
    this.cta.opacity = pCta;
    this.cta.transform = 'scale(' + lerp(0.88, 1.0, pCta) + ')';

    this.subtext.opacity = eo(seg(t, 1.8, 2.5));

    // Breathing pulse for end card
    const breathe = 1 + Math.sin(t * 3) * 0.012;
    this.wrap.transform = 'scale(' + breathe + ')';
  }
});

