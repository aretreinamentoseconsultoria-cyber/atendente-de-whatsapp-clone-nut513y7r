// Runner WebGL para LiquidOrb (fallback de altíssima fidelidade ao shader WGSL de blueDrop)
import { WEBGL_VERTEX_SHADER, WEBGL_FRAGMENT_SHADER } from './liquidOrbWebGL'

export interface WebGLOrbInstance {
  setUniforms: (values: Float32Array) => void
  render: (width: number, height: number) => void
  destroy: () => void
}

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`WebGL Shader Compilation Error: ${info}`)
  }
  return shader
}

export function initWebGLOrb(canvas: HTMLCanvasElement): WebGLOrbInstance | null {
  const gl =
    canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      preserveDrawingBuffer: false,
    }) ||
    (canvas.getContext('experimental-webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      preserveDrawingBuffer: false,
    }) as WebGLRenderingContext | null)

  if (!gl) return null

  let vertShader: WebGLShader | null = null
  let fragShader: WebGLShader | null = null
  let program: WebGLProgram | null = null
  let buffer: WebGLBuffer | null = null

  try {
    vertShader = createShader(gl, gl.VERTEX_SHADER, WEBGL_VERTEX_SHADER)
    fragShader = createShader(gl, gl.FRAGMENT_SHADER, WEBGL_FRAGMENT_SHADER)
    if (!vertShader || !fragShader) return null

    program = gl.createProgram()
    if (!program) return null

    gl.attachShader(program, vertShader)
    gl.attachShader(program, fragShader)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program)
      throw new Error(`WebGL Program Link Error: ${info}`)
    }

    const posAttr = gl.getAttribLocation(program, 'a_position')

    // Quad de tela inteira (dois triângulos)
    buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    )

    // Localização dos uniforms
    const uLocations = {
      u_size: gl.getUniformLocation(program, 'u_size'),
      u_time: gl.getUniformLocation(program, 'u_time'),
      u_speed: gl.getUniformLocation(program, 'u_speed'),
      u_radius: gl.getUniformLocation(program, 'u_radius'),
      u_zoom: gl.getUniformLocation(program, 'u_zoom'),
      u_warp: gl.getUniformLocation(program, 'u_warp'),
      u_ridgeAmt: gl.getUniformLocation(program, 'u_ridgeAmt'),
      u_sharp: gl.getUniformLocation(program, 'u_sharp'),
      u_shade: gl.getUniformLocation(program, 'u_shade'),
      u_sheen: gl.getUniformLocation(program, 'u_sheen'),
      u_gloss: gl.getUniformLocation(program, 'u_gloss'),
      u_shellMidAlpha: gl.getUniformLocation(program, 'u_shellMidAlpha'),
      u_shellEdgeAlpha: gl.getUniformLocation(program, 'u_shellEdgeAlpha'),
      u_exposure: gl.getUniformLocation(program, 'u_exposure'),
      u_edgeSoftness: gl.getUniformLocation(program, 'u_edgeSoftness'),
      u_edgeGlow: gl.getUniformLocation(program, 'u_edgeGlow'),
      u_glassEnabled: gl.getUniformLocation(program, 'u_glassEnabled'),
      u_glassOpacity: gl.getUniformLocation(program, 'u_glassOpacity'),
      u_contourDeform: gl.getUniformLocation(program, 'u_contourDeform'),
      u_colorA: gl.getUniformLocation(program, 'u_colorA'),
      u_colorB: gl.getUniformLocation(program, 'u_colorB'),
      u_colorC: gl.getUniformLocation(program, 'u_colorC'),
      u_colorD: gl.getUniformLocation(program, 'u_colorD'),
      u_highlightColor: gl.getUniformLocation(program, 'u_highlightColor'),
      u_shellInner: gl.getUniformLocation(program, 'u_shellInner'),
      u_shellMid: gl.getUniformLocation(program, 'u_shellMid'),
      u_shellEdge: gl.getUniformLocation(program, 'u_shellEdge'),
      u_sheenColor: gl.getUniformLocation(program, 'u_sheenColor'),
      u_specColor: gl.getUniformLocation(program, 'u_specColor'),
      u_canvasColor: gl.getUniformLocation(program, 'u_canvasColor'),
      u_glowColor: gl.getUniformLocation(program, 'u_glowColor'),
    }

    gl.useProgram(program)
    gl.enableVertexAttribArray(posAttr)
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0)

    return {
      setUniforms(v: Float32Array) {
        if (!gl || !program) return
        gl.useProgram(program)

        // v[0], v[1]: size
        if (uLocations.u_size) gl.uniform2f(uLocations.u_size, v[0], v[1])
        // v[2]: time, v[3]: speed, v[4]: radius, v[5]: zoom, v[6]: warp
        if (uLocations.u_time) gl.uniform1f(uLocations.u_time, v[2])
        if (uLocations.u_speed) gl.uniform1f(uLocations.u_speed, v[3])
        if (uLocations.u_radius) gl.uniform1f(uLocations.u_radius, v[4])
        if (uLocations.u_zoom) gl.uniform1f(uLocations.u_zoom, v[5])
        if (uLocations.u_warp) gl.uniform1f(uLocations.u_warp, v[6])
        // v[7]: ridgeAmt, v[8]: sharp, v[9]: shade, v[10]: sheen, v[11]: gloss
        if (uLocations.u_ridgeAmt) gl.uniform1f(uLocations.u_ridgeAmt, v[7])
        if (uLocations.u_sharp) gl.uniform1f(uLocations.u_sharp, v[8])
        if (uLocations.u_shade) gl.uniform1f(uLocations.u_shade, v[9])
        if (uLocations.u_sheen) gl.uniform1f(uLocations.u_sheen, v[10])
        if (uLocations.u_gloss) gl.uniform1f(uLocations.u_gloss, v[11])
        // v[12]: shellMidAlpha, v[13]: shellEdgeAlpha, v[14]: exposure
        if (uLocations.u_shellMidAlpha) gl.uniform1f(uLocations.u_shellMidAlpha, v[12])
        if (uLocations.u_shellEdgeAlpha) gl.uniform1f(uLocations.u_shellEdgeAlpha, v[13])
        if (uLocations.u_exposure) gl.uniform1f(uLocations.u_exposure, v[14])
        // v[16]: edgeSoftness, v[17]: edgeGlow
        if (uLocations.u_edgeSoftness) gl.uniform1f(uLocations.u_edgeSoftness, v[16])
        if (uLocations.u_edgeGlow) gl.uniform1f(uLocations.u_edgeGlow, v[17])
        // v[19]: glassEnabled, v[20]: glassOpacity, v[21]: contourDeform
        if (uLocations.u_glassEnabled) gl.uniform1f(uLocations.u_glassEnabled, v[19])
        if (uLocations.u_glassOpacity) gl.uniform1f(uLocations.u_glassOpacity, v[20])
        if (uLocations.u_contourDeform) gl.uniform1f(uLocations.u_contourDeform, v[21])

        // Cores (vec4) a partir do índice 40
        // colorA: [40..43]
        if (uLocations.u_colorA) gl.uniform4f(uLocations.u_colorA, v[40], v[41], v[42], v[43])
        // colorB: [44..47]
        if (uLocations.u_colorB) gl.uniform4f(uLocations.u_colorB, v[44], v[45], v[46], v[47])
        // colorC: [48..51]
        if (uLocations.u_colorC) gl.uniform4f(uLocations.u_colorC, v[48], v[49], v[50], v[51])
        // colorD: [52..55]
        if (uLocations.u_colorD) gl.uniform4f(uLocations.u_colorD, v[52], v[53], v[54], v[55])
        // highlightColor: [56..59]
        if (uLocations.u_highlightColor)
          gl.uniform4f(uLocations.u_highlightColor, v[56], v[57], v[58], v[59])
        // shellInner: [60..63]
        if (uLocations.u_shellInner)
          gl.uniform4f(uLocations.u_shellInner, v[60], v[61], v[62], v[63])
        // shellMid: [64..67]
        if (uLocations.u_shellMid) gl.uniform4f(uLocations.u_shellMid, v[64], v[65], v[66], v[67])
        // shellEdge: [68..71]
        if (uLocations.u_shellEdge) gl.uniform4f(uLocations.u_shellEdge, v[68], v[69], v[70], v[71])
        // sheenColor: [72..75]
        if (uLocations.u_sheenColor)
          gl.uniform4f(uLocations.u_sheenColor, v[72], v[73], v[74], v[75])
        // specColor: [76..79]
        if (uLocations.u_specColor) gl.uniform4f(uLocations.u_specColor, v[76], v[77], v[78], v[79])
        // canvasColor: [80..83]
        if (uLocations.u_canvasColor)
          gl.uniform4f(uLocations.u_canvasColor, v[80], v[81], v[82], v[83])
        // glowColor: [84..87]
        if (uLocations.u_glowColor) gl.uniform4f(uLocations.u_glowColor, v[84], v[85], v[86], v[87])
      },
      render(width: number, height: number) {
        if (!gl || !program) return
        gl.viewport(0, 0, width, height)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.useProgram(program)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      },
      destroy() {
        try {
          if (buffer) gl.deleteBuffer(buffer)
          if (vertShader) gl.deleteShader(vertShader)
          if (fragShader) gl.deleteShader(fragShader)
          if (program) gl.deleteProgram(program)
        } catch {
          // Ignora na desmontagem
        }
      },
    }
  } catch (err) {
    console.warn('Falha ao inicializar pipeline WebGL do LiquidOrb:', err)
    return null
  }
}
