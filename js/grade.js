// Өнгө засвар (color grade) — WebGL шэйдэр. Safari/WebKit-д canvas `filter` байдаггүй тул
// бичлэгийн кадр бүрийг энд GPU дээр боловсруулаад, үр дүнг 2D canvas руу зурна.
//
// recipe.look талбарууд (бүгд заавал биш):
//   exposure    стоп: -1 … +1            (0 = өөрчлөхгүй)
//   blackPoint  хар цэг өргөх 0 … 0.1    (iPhone шөнийн бичлэгийн "дарагдсан" харанхуйг сэргээнэ)
//   contrast    1 = өөрчлөхгүй
//   saturation  1 = өөрчлөхгүй
//   temperature -1 хүйтэн … +1 дулаан
//   shadows     { color, amount }        харанхуй хэсгийг өнгөлөх (split tone — lift)
//   highlights  { color, amount }        гэрэлтэй хэсгийг өнгөлөх (gain)
//   tint        { color, opacity }       бүхэлд нь нимгэн өнгөний давхарга
//   vignette    0 … 1                    захыг харлуулах
//   grain       0 … 0.2                  кино мөхлөг

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_scale;       // cover + zoom: дэлгэцийн uv → эх зургийн uv
uniform vec2 u_res;
uniform float u_time;
uniform float u_exposure, u_black, u_contrast, u_saturation, u_temperature;
uniform vec3 u_shadowColor;  uniform float u_shadowAmount;
uniform vec3 u_highColor;    uniform float u_highAmount;
uniform vec3 u_tintColor;    uniform float u_tintOpacity;
uniform float u_vignette, u_grain;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = 0.5 + (v_uv - 0.5) * u_scale;
  vec3 c = texture2D(u_tex, vec2(uv.x, 1.0 - uv.y)).rgb;

  c *= pow(2.0, u_exposure);
  c = c + u_black * (1.0 - c);                       // хар цэг өргөх
  c = (c - 0.5) * u_contrast + 0.5;
  float l = luma(c);
  c = mix(vec3(l), c, u_saturation);
  c += vec3(0.05, 0.015, -0.06) * u_temperature;     // дулаан = улаан+шар нэмэх, цэнхэр хасах

  float ws = 1.0 - smoothstep(0.0, 0.45, l);         // харанхуй жин
  float wh = smoothstep(0.55, 1.0, l);               // гэрэлтэй жин
  c += (u_shadowColor - 0.5) * u_shadowAmount * ws;
  c += (u_highColor - 0.5) * u_highAmount * wh;

  c = mix(c, u_tintColor, u_tintOpacity);

  float d = length((v_uv - 0.5) * u_res) / u_res.y;  // 2D хувилбартай ижил: H*0.25 … H*0.75
  c *= 1.0 - u_vignette * smoothstep(0.25, 0.75, d);

  float n = hash(floor(v_uv * u_res * 0.5) + fract(u_time) * 97.0);
  c += (n - 0.5) * u_grain;

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export function createGrader(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
  if (!gl) return null;

  const program = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('grade shader:', gl.getShaderInfoLog(sh));
      return null;
    }
    gl.attachShader(program, sh);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const u = {};
  for (const name of [
    'u_tex', 'u_scale', 'u_res', 'u_time', 'u_exposure', 'u_black', 'u_contrast', 'u_saturation', 'u_temperature',
    'u_shadowColor', 'u_shadowAmount', 'u_highColor', 'u_highAmount', 'u_tintColor', 'u_tintOpacity', 'u_vignette', 'u_grain',
  ]) u[name] = gl.getUniformLocation(program, name);
  gl.uniform1i(u.u_tex, 0);
  gl.uniform2f(u.u_res, width, height);
  gl.viewport(0, 0, width, height);

  let lastSource = null;
  let lastFrameKey = null;

  // el = <video> эсвэл <img>; zoom = Ken Burns; look = recipe.look; time = секунд (мөхлөгт)
  function render(el, zoom, look, time) {
    const sw = el.videoWidth || el.naturalWidth;
    const sh = el.videoHeight || el.naturalHeight;
    if (!sw || !sh) return null;

    // Зогссон кадрыг дахин upload хийхгүй (зураг, pause үед)
    const frameKey = el.currentTime ?? 0;
    if (el !== lastSource || frameKey !== lastFrameKey || el.tagName === 'VIDEO') {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el);
      lastSource = el;
      lastFrameKey = frameKey;
    }

    const s = Math.max(width / sw, height / sh) * zoom;
    gl.uniform2f(u.u_scale, width / (sw * s), height / (sh * s));
    gl.uniform1f(u.u_time, time || 0);
    gl.uniform1f(u.u_exposure, look.exposure ?? 0);
    gl.uniform1f(u.u_black, look.blackPoint ?? 0);
    gl.uniform1f(u.u_contrast, look.contrast ?? 1);
    gl.uniform1f(u.u_saturation, look.saturation ?? look.saturate ?? 1);
    gl.uniform1f(u.u_temperature, look.temperature ?? 0);
    setColor(u.u_shadowColor, look.shadows?.color ?? '#000000');
    gl.uniform1f(u.u_shadowAmount, look.shadows?.amount ?? 0);
    setColor(u.u_highColor, look.highlights?.color ?? '#ffffff');
    gl.uniform1f(u.u_highAmount, look.highlights?.amount ?? 0);
    setColor(u.u_tintColor, look.tint?.color ?? '#000000');
    gl.uniform1f(u.u_tintOpacity, look.tint?.opacity ?? 0);
    gl.uniform1f(u.u_vignette, look.vignette ?? 0);
    gl.uniform1f(u.u_grain, look.grain ?? 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return canvas;
  }

  function setColor(loc, hex) {
    const n = parseInt(hex.slice(1), 16);
    gl.uniform3f(loc, ((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  return { render, canvas };
}
