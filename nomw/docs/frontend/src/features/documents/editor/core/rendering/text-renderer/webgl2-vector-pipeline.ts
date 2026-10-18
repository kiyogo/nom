import { GlyphGeometryMesh } from './glyph-vector-builder';

export interface RenderGlyphInstance {
  mesh: GlyphGeometryMesh;
  x: number; // in physical pixels
  y: number; // in physical baseline pixels
  fontSizePx: number; // height in physical pixels
  color: [number, number, number, number]; // RGBA [0..1]
}

// Evan Wallace's exact 6-rook subpixel jitter pattern
const JITTER_PATTERN: [number, number][] = [
  [-1 / 12, -5 / 12],
  [ 1 / 12,  1 / 12],
  [ 3 / 12, -1 / 12],
  [ 5 / 12,  5 / 12],
  [ 7 / 12, -3 / 12],
  [ 9 / 12,  3 / 12],
];

const SAMPLE_COLORS: [number, number, number, number][] = [
  [1, 0, 0, 0], // Sample 0 -> Red lower/upper
  [1, 0, 0, 0], // Sample 1 -> Red lower/upper
  [0, 1, 0, 0], // Sample 2 -> Green lower/upper
  [0, 1, 0, 0], // Sample 3 -> Green lower/upper
  [0, 0, 1, 0], // Sample 4 -> Blue lower/upper
  [0, 0, 1, 0], // Sample 5 -> Blue lower/upper
];

export class WebGL2VectorPipeline {
  private gl: WebGL2RenderingContext | null = null;
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;

  // Pass 1: Glyph loop-blinn + winding accumulation shader
  private glyphProgram: WebGLProgram | null = null;
  private uGlyphResolutionLoc: WebGLUniformLocation | null = null;
  private uTransformLoc: WebGLUniformLocation | null = null;
  private uSampleColorLoc: WebGLUniformLocation | null = null;
  private aGlyphPosLoc = -1;

  // Pass 2: Screen resolve shader with Evan Wallace subpixel energy filter
  private resolveProgram: WebGLProgram | null = null;
  private uResolveTextureLoc: WebGLUniformLocation | null = null;
  private uResolveResolutionLoc: WebGLUniformLocation | null = null;
  private uResolveTextColorLoc: WebGLUniformLocation | null = null;
  private aQuadPosLoc = -1;
  private quadVbo: WebGLBuffer | null = null;

  // Offscreen accumulator texture & FBO
  private fbo: WebGLFramebuffer | null = null;
  private colorTexture: WebGLTexture | null = null;

  private currentWidth = 0;
  private currentHeight = 0;

  constructor() {
    this.initPipeline();
  }

  public initPipeline(): boolean {
    if (this.gl) return true;

    try {
      if (typeof OffscreenCanvas !== 'undefined') {
        this.canvas = new OffscreenCanvas(1024, 1024);
      } else if (typeof document !== 'undefined') {
        const c = document.createElement('canvas');
        c.width = 1024;
        c.height = 1024;
        this.canvas = c;
      }

      if (!this.canvas) return false;

      const gl = this.canvas.getContext('webgl2', {
        alpha: true,
        depth: false,
        stencil: false,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
      }) as WebGL2RenderingContext | null;

      if (!gl) return false;
      this.gl = gl;

      // 1. Shaders for Pass 1: Glyph Vector Outline & Winding Accumulation
      const glyphVs = `#version 300 es
        in vec4 a_position; // xy = vertex pos, zw = (s, t)

        uniform vec2 u_resolution;
        uniform vec3 u_transform; // [x, y, scale]

        out vec2 v_coord;

        void main() {
          vec2 physicalPos = u_transform.xy + (a_position.xy * u_transform.z);
          vec2 zeroToOne = physicalPos / u_resolution;
          vec2 clipSpace = (zeroToOne * 2.0) - 1.0;
          gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);
          v_coord = a_position.zw;
        }
      `;

      const glyphFs = `#version 300 es
        precision highp float;

        in vec2 v_coord;
        uniform vec4 u_sampleColor;

        out vec4 fragColor;

        void main() {
          // Loop-Blinn quadratic evaluation:
          // For solid: s = 0, t = 1 => 0 - 1 = -1 <= 0 (never discarded)
          // For curve: s^2 - t <= 0 inside curve, > 0 outside curve
          if (v_coord.x * v_coord.x - v_coord.y > 0.0) {
            discard;
          }

          // Upper 4 bits: front faces (16.0 / 255.0)
          // Lower 4 bits: back faces (1.0 / 255.0)
          fragColor = u_sampleColor * (gl_FrontFacing ? (16.0 / 255.0) : (1.0 / 255.0));
        }
      `;

      // 2. Shaders for Pass 2: Evan Wallace Subpixel Resolution & 1-pixel Filtering
      const resolveVs = `#version 300 es
        in vec2 a_quadPos;
        out vec2 v_uv;

        void main() {
          v_uv = a_quadPos * 0.5 + 0.5;
          gl_Position = vec4(a_quadPos, 0.0, 1.0);
        }
      `;

      const resolveFs = `#version 300 es
        precision highp float;

        uniform sampler2D u_texture;
        uniform vec2 u_resolution;
        uniform vec4 u_textColor;

        in vec2 v_uv;
        out vec4 outColor;

        void main() {
          vec2 texel = 1.0 / u_resolution;

          // Samples for 0, +1/3, +2/3 (current pixel)
          vec3 valueR = texture(u_texture, v_uv).xyz * 255.0;
          vec3 lowerR = mod(valueR, 16.0);
          vec3 upperR = (valueR - lowerR) / 16.0;
          vec3 alphaR = min(abs(upperR - lowerR), 2.0);

          // Samples for -2/3 and -1/3 (left neighbor pixel)
          vec2 valueL = texture(u_texture, vec2(v_uv.x - texel.x, v_uv.y)).yz * 255.0;
          vec2 lowerL = mod(valueL, 16.0);
          vec2 upperL = (valueL - lowerL) / 16.0;
          vec2 alphaL = min(abs(upperL - lowerL), 2.0);

          // Evan Wallace subpixel energy distribution over 1 pixel
          vec3 subpixel = vec3(
            (alphaR.x + alphaR.y + alphaR.z) / 6.0,
            (alphaL.y + alphaR.x + alphaR.y) / 6.0,
            (alphaL.x + alphaL.y + alphaR.x) / 6.0
          );

          float coverage = (alphaR.x + alphaR.y + alphaR.z) / 6.0;
          float alpha = mix(coverage, (subpixel.r + subpixel.g + subpixel.b) / 3.0, 0.5);

          if (alpha <= 0.002) {
            discard;
          }

          outColor = vec4(u_textColor.rgb, alpha * u_textColor.a);
        }
      `;

      this.glyphProgram = this.createProgram(gl, glyphVs, glyphFs);
      this.resolveProgram = this.createProgram(gl, resolveVs, resolveFs);
      if (!this.glyphProgram || !this.resolveProgram) return false;

      this.uGlyphResolutionLoc = gl.getUniformLocation(this.glyphProgram, 'u_resolution');
      this.uTransformLoc = gl.getUniformLocation(this.glyphProgram, 'u_transform');
      this.uSampleColorLoc = gl.getUniformLocation(this.glyphProgram, 'u_sampleColor');
      this.aGlyphPosLoc = gl.getAttribLocation(this.glyphProgram, 'a_position');

      this.uResolveTextureLoc = gl.getUniformLocation(this.resolveProgram, 'u_texture');
      this.uResolveResolutionLoc = gl.getUniformLocation(this.resolveProgram, 'u_resolution');
      this.uResolveTextColorLoc = gl.getUniformLocation(this.resolveProgram, 'u_textColor');
      this.aQuadPosLoc = gl.getAttribLocation(this.resolveProgram, 'a_quadPos');

      // Initialize Quad VBO
      this.quadVbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
      const quadVerts = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1,
      ]);
      gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

      // Create Framebuffer & Accumulator Texture
      this.fbo = gl.createFramebuffer();
      this.colorTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1024, 1024, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorTexture, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      return true;
    } catch (e) {
      console.warn('Failed to initialize WebGL2 vector text pipeline:', e);
      return false;
    }
  }

  public resize(width: number, height: number): void {
    if (!this.gl || !this.canvas) return;
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));

    if (this.currentWidth !== w || this.currentHeight !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.currentWidth = w;
      this.currentHeight = h;

      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      gl.viewport(0, 0, w, h);
    }
  }

  public beginFrame(width: number, height: number): void {
    if (!this.gl) return;
    this.resize(width, height);

    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  public getMeshVbo(mesh: GlyphGeometryMesh): WebGLBuffer | null {
    if (mesh.gpuVbo && this.gl?.isBuffer(mesh.gpuVbo)) {
      return mesh.gpuVbo;
    }
    if (!this.gl) return null;
    const gl = this.gl;
    const vbo = gl.createBuffer();
    if (!vbo) return null;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
    mesh.gpuVbo = vbo;
    return vbo;
  }

  /**
   * Renders glyph instances using Evan Wallace's two-pass algorithm:
   * 1. Accumulate 6-sample winding counts into offscreen texture with additive blending.
   * 2. Resolve to screen with 1-pixel LCD subpixel energy distribution.
   */
  public renderGlyphs(glyphs: RenderGlyphInstance[]): void {
    if (!this.gl || !this.glyphProgram || !this.resolveProgram || glyphs.length === 0) return;
    const gl = this.gl;

    // Group glyphs by color
    const colorGroups = new Map<string, { color: [number, number, number, number]; glyphs: RenderGlyphInstance[] }>();
    for (const g of glyphs) {
      const key = `${g.color[0].toFixed(3)},${g.color[1].toFixed(3)},${g.color[2].toFixed(3)},${g.color[3].toFixed(3)}`;
      let group = colorGroups.get(key);
      if (!group) {
        group = { color: g.color, glyphs: [] };
        colorGroups.set(key, group);
      }
      group.glyphs.push(g);
    }

    for (const group of colorGroups.values()) {
      // STEP 1: Accumulate into offscreen texture with additive blending
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.viewport(0, 0, this.currentWidth, this.currentHeight);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);

      gl.useProgram(this.glyphProgram);
      gl.uniform2f(this.uGlyphResolutionLoc, this.currentWidth, this.currentHeight);

      // Render 6 jitter samples
      for (let j = 0; j < 6; j++) {
        const offset = JITTER_PATTERN[j];
        gl.uniform4fv(this.uSampleColorLoc, SAMPLE_COLORS[j]);

        for (const g of group.glyphs) {
          if (g.mesh.totalTriangles === 0) continue;
          const vbo = this.getMeshVbo(g.mesh);
          if (!vbo) continue;

          gl.uniform3f(this.uTransformLoc, g.x + offset[0], g.y + offset[1], g.fontSizePx);

          gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
          gl.enableVertexAttribArray(this.aGlyphPosLoc);
          gl.vertexAttribPointer(this.aGlyphPosLoc, 4, gl.FLOAT, false, 16, 0);
          gl.drawArrays(gl.TRIANGLES, 0, g.mesh.totalTriangles * 3);
        }
      }

      // STEP 2: Resolve to canvas with text color and subpixel filtering
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.currentWidth, this.currentHeight);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(this.resolveProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);
      gl.uniform1i(this.uResolveTextureLoc, 0);
      gl.uniform2f(this.uResolveResolutionLoc, this.currentWidth, this.currentHeight);
      gl.uniform4fv(this.uResolveTextColorLoc, group.color);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
      gl.enableVertexAttribArray(this.aQuadPosLoc);
      gl.vertexAttribPointer(this.aQuadPosLoc, 2, gl.FLOAT, false, 8, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }

  public getOutputCanvas(): HTMLCanvasElement | OffscreenCanvas | null {
    return this.canvas;
  }

  private createProgram(gl: WebGL2RenderingContext, vsSource: string, fsSource: string): WebGLProgram | null {
    const vs = this.compileShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('Program link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    return program;
  }

  private compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  public dispose(): void {
    if (!this.gl) return;
    const gl = this.gl;
    if (this.glyphProgram) gl.deleteProgram(this.glyphProgram);
    if (this.resolveProgram) gl.deleteProgram(this.resolveProgram);
    if (this.quadVbo) gl.deleteBuffer(this.quadVbo);
    if (this.colorTexture) gl.deleteTexture(this.colorTexture);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    this.gl = null;
  }
}
