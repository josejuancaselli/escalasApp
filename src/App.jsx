import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { HOLES, RAILS, INIT, NOTATIONS, noteName, letterName, scaleTitle, freq } from './theory.js'
import './App.css'

const PORTRAIT = '(orientation: portrait)'
const isFixed = (k) => k === 0 || k === INIT.length - 1 // primera y última ficha: fijas
const startBoard = () => ({ holes: [...INIT], pile: [] }) // holes[k] = hueco de la ficha k (null si está en la pila)
const COLORS = { fixed: '#185FA5', fixedLine: '#0C447C', normal: '#378ADD', line: '#185FA5', lit: '#85B7EB' }

// true cuando la pantalla es más alta que ancha (celular parado): el tablero se dibuja vertical.
// Se actualiza solo al girar el celular.
function usePortrait() {
  const [portrait, setPortrait] = useState(() => window.matchMedia(PORTRAIT).matches)
  useEffect(() => {
    const m = window.matchMedia(PORTRAIT)
    const on = () => setPortrait(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return portrait
}

// Medidas del dibujo según orientación. pos(columna, carril) -> punto; slot(i) -> lugar i de la pila
function makeLayout(V) {
  const RW = V ? 38 : 42
  const LN = V ? 62 : 65
  return {
    RW,
    TW: V ? 44 : 30,
    TH: V ? 30 : 40,
    PB: V ? 232 : 586, // desde esta coordenada hacia adelante empieza la pila
    viewBox: V ? '0 0 360 534' : '0 0 680 290',
    pos: (c, l) => (V ? { x: 115 + LN * l, y: 20 + RW * (12.5 - c) } : { x: 30 + RW * (c + 0.5), y: 150 + LN * l }),
    slot: (i) => ({ x: V ? 290 : 624, y: (V ? 494 : 248) - 14 * i }),
  }
}

// Punto más cercano de un riel (lista de puntos) a p, y cuánto del recorrido (s de L) lleva
function project(pts, p) {
  let best = { d: Infinity }
  let acc = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len)))
    const x = a.x + t * dx
    const y = a.y + t * dy
    const d = Math.hypot(p.x - x, p.y - y)
    if (d < best.d) best = { d, x, y, s: acc + t * len }
    acc += len
  }
  return { ...best, L: acc }
}

// Ajusta el ancho de un selector a lo que ocupa el texto elegido (más un margen para la flechita)
function fitSelect(s) {
  const c = document.createElement('canvas').getContext('2d')
  const cs = getComputedStyle(s)
  c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
  s.style.width = Math.ceil(c.measureText(s.options[s.selectedIndex].text).width + 34) + 'px'
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4v16l13-8z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

export default function App() {
  const V = usePortrait() // V = vertical
  const L = makeLayout(V)

  const [board, setBoard] = useState(startBoard)
  const [drag, setDrag] = useState(null) // { k, x, y, mode, sel, slides, opts }
  const [keyLetter, setKeyLetter] = useState('') // '' = sin tonalidad, o 0 a 6 (Do a Si)
  const [keyAcc, setKeyAcc] = useState(0) // 0 natural, 1 sostenido, -1 bemol
  const [notation, setNotation] = useState('') // '' = "Cifrado" sin elegir: se lee como tradicional (Do Re Mi)
  const [lit, setLit] = useState(null) // columna que suena durante Play

  const svgRef = useRef(null)
  const selRef = useRef(null)
  const accRef = useRef(null)
  const notRef = useRef(null)
  const ac = useRef(null)
  const busy = useRef(false)
  const timers = useRef([])

  const { holes, pile } = board
  const key = keyLetter === '' ? null : { letter: +keyLetter, acc: keyAcc }
  const system = notation || 'tradicional'
  const occupied = new Set(holes.filter(Boolean))
  const title = scaleTitle(holes.filter(Boolean).map((h) => HOLES[h].col))

  // Posición de cada hueco en pantalla
  const P = {}
  for (const id in HOLES) P[id] = L.pos(HOLES[id].col, HOLES[id].lane)

  // ---- Sonido ----
  function audio() {
    try {
      ac.current = ac.current || new (window.AudioContext || window.webkitAudioContext)()
      ac.current.resume()
    } catch {
      /* sin audio */
    }
  }
  function note(col, when = 0) {
    const c = ac.current
    if (!c) return
    const o = c.createOscillator()
    const g = c.createGain()
    const t = c.currentTime + when
    o.type = 'triangle'
    o.frequency.value = freq(col, key)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.3, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2)
    o.connect(g)
    g.connect(c.destination)
    o.start(t)
    o.stop(t + 1.3)
  }

  // ---- Arrastre ----
  function toSvg(e) {
    const s = svgRef.current
    const p = s.createSVGPoint()
    p.x = e.clientX
    p.y = e.clientY
    return p.matrixTransform(s.getScreenCTM().inverse())
  }

  // Rieles por los que puede deslizarse la ficha que está en el hueco id (si el otro extremo está libre)
  function slidesFrom(id) {
    return RAILS.filter((r) => r.includes(id)).flatMap(([n, a]) => {
      const to = n === id ? a : n
      if (occupied.has(to)) return []
      const corner = L.pos(HOLES[n].col, HOLES[a].lane)
      return [{ to, pts: n === id ? [P[n], corner, P[a]] : [P[a], corner, P[n]] }]
    })
  }

  function down(e, k) {
    audio()
    if (isFixed(k)) {
      note(HOLES[holes[k]].col)
      return
    }
    svgRef.current.setPointerCapture(e.pointerId)
    const h = holes[k]
    const slides = h ? slidesFrom(h) : []
    // Desde el tablero: solo los rieles. Desde la pila: cualquier hueco libre.
    const opts = h ? slides.map((s) => s.to) : Object.keys(HOLES).filter((id) => !occupied.has(id))
    setDrag({ k, x: null, y: null, mode: 0, sel: null, slides, opts })
  }

  function move(e) {
    if (!drag) return
    const p = toSvg(e)
    let best = null
    if (holes[drag.k] && p.x < L.PB) {
      drag.slides.forEach((s) => {
        const q = project(s.pts, p)
        if (!best || q.d < best.d) best = { ...q, to: s.to }
      })
    }
    if (best && best.d < 40) setDrag({ ...drag, x: best.x, y: best.y, mode: 1, sel: best }) // pegada al riel
    else setDrag({ ...drag, x: p.x, y: p.y, mode: 0, sel: null }) // suelta
  }

  function up(e) {
    if (!drag) return
    const { k } = drag
    const p = toSvg(e)
    const h = holes[k]
    let nextHoles = holes
    let nextPile = pile
    let col = null

    if (h) {
      if (drag.mode && drag.sel.s / drag.sel.L > 0.5) {
        // pasó la mitad del riel: queda en el otro extremo
        nextHoles = holes.map((x, i) => (i === k ? drag.sel.to : x))
        col = HOLES[drag.sel.to].col
      } else if (!drag.mode && p.x >= L.PB) {
        // soltada sobre la pila: se quita
        nextHoles = holes.map((x, i) => (i === k ? null : x))
        nextPile = [...pile, k]
        col = HOLES[h].col
      } else {
        col = HOLES[h].col // vuelve a su hueco
      }
    } else {
      // viene de la pila: al hueco libre más cercano; si no hay ninguno cerca, queda en la pila
      let best = null
      let bd = 34
      drag.opts.forEach((id) => {
        const d = Math.hypot(P[id].x - p.x, P[id].y - p.y)
        if (d < bd) {
          bd = d
          best = id
        }
      })
      if (best) {
        nextHoles = holes.map((x, i) => (i === k ? best : x))
        nextPile = pile.filter((i) => i !== k)
        col = HOLES[best].col
      }
    }

    setBoard({ holes: nextHoles, pile: nextPile })
    setDrag(null)
    if (col !== null) note(col)
  }

  // Evita que el celular haga scroll al agarrar una ficha
  useEffect(() => {
    const s = svgRef.current
    const stop = (e) => {
      if (e.target.closest('.movable')) e.preventDefault()
    }
    s.addEventListener('touchstart', stop, { passive: false })
    return () => s.removeEventListener('touchstart', stop)
  }, [])

  // ---- Play: toca las notas distintas de grave a agudo, iluminando las fichas ----
  function play() {
    if (busy.current) return
    audio()
    if (!ac.current) return
    const cols = [...new Set(holes.filter(Boolean).map((h) => HOLES[h].col))].sort((a, b) => a - b)
    if (!cols.length) return
    busy.current = true
    cols.forEach((c, i) => {
      note(c, i * 0.5)
      timers.current.push(setTimeout(() => setLit(c), i * 500), setTimeout(() => setLit(null), i * 500 + 400))
    })
    timers.current.push(setTimeout(() => (busy.current = false), cols.length * 500))
  }
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // Los selectores se ajustan al texto elegido (cambia con la tonalidad y con el cifrado)
  useLayoutEffect(() => {
    fitSelect(selRef.current)
    fitSelect(accRef.current)
    fitSelect(notRef.current)
  }, [keyLetter, keyAcc, notation])

  // ---- Dibujo ----
  const dk = drag ? drag.k : null
  // Orden de dibujo: fichas del tablero, pila, y la que se arrastra encima de todo
  const order = [
    ...holes.map((_, k) => k).filter((k) => holes[k] && k !== dk),
    ...pile.filter((k) => k !== dk),
    ...(dk !== null ? [dk] : []),
  ]
  const posOf = (k) => {
    if (drag && drag.k === k && drag.x !== null) return { x: drag.x, y: drag.y }
    return holes[k] ? P[holes[k]] : L.slot(pile.indexOf(k))
  }
  const labelOf = (k) => {
    if (drag && drag.k === k && drag.mode) {
      return noteName(key, drag.sel.s / drag.sel.L > 0.5 ? drag.sel.to : holes[k], system)
    }
    return noteName(key, holes[k], system)
  }
  const cuts = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <main className={'app ' + (V ? 'portrait' : 'landscape')}>
      <h1 className="sr-only">Tablero de escalas</h1>
      <div className="title" aria-live="polite">
        {title}
      </div>

      <svg
        ref={svgRef}
        className={'board' + (drag ? ' dragging' : '')}
        viewBox={L.viewBox}
        aria-label="Tablero de escalas con fichas arrastrables y una pila para las fichas quitadas"
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setDrag(null)}
      >
        {V ? (
          <>
            <rect className="frame" x="10" y="20" width="210" height={L.RW * 13} rx="4" />
            {cuts.map((k) => (
              <line key={k} className="divider" x1="10" y1={20 + L.RW * k} x2="220" y2={20 + L.RW * k} />
            ))}
            <rect className="band" x="88" y="20" width="54" height={L.RW * 13} />
            <rect className="tray" x="240" y="20" width="100" height={L.RW * 13} rx="4" />
          </>
        ) : (
          <>
            <rect className="frame" x="30" y="30" width={L.RW * 13} height="240" rx="4" />
            {cuts.map((k) => (
              <line key={k} className="divider" x1={30 + L.RW * k} y1="30" x2={30 + L.RW * k} y2="270" />
            ))}
            <rect className="band" x="30" y="125" width={L.RW * 13} height="50" />
            <rect className="tray" x="594" y="30" width="60" height="240" rx="4" />
          </>
        )}

        {RAILS.map(([n, a]) => {
          const c = L.pos(HOLES[n].col, HOLES[a].lane)
          return <path key={n + a} className="rail" d={`M${P[n].x} ${P[n].y}L${c.x} ${c.y}L${P[a].x} ${P[a].y}`} />
        })}

        {Object.entries(P).map(([id, p]) => {
          const on = drag ? drag.opts.includes(id) : false
          return <circle key={id} className={'hole' + (on ? ' hl' : '')} cx={p.x} cy={p.y} r={on ? 11 : 8} />
        })}

        {order.map((k) => {
          const { x, y } = posOf(k)
          const fixed = isFixed(k)
          const on = holes[k] !== null && lit === HOLES[holes[k]].col
          const label = labelOf(k)
          // Los nombres largos (Sol♭♭, Solx) se escriben un poco más chicos para que entren en la ficha
          const fontSize = (V ? 15 : 13) * (label.length >= 5 ? 0.75 : label.length === 4 ? 0.9 : 1)
          return (
            <g key={k} className={'tok ' + (fixed ? 'fixed' : 'movable')} onPointerDown={(e) => down(e, k)}>
              <rect
                x={x - L.TW / 2}
                y={y - L.TH / 2}
                width={L.TW}
                height={L.TH}
                rx="4"
                fill={on ? COLORS.lit : fixed ? COLORS.fixed : COLORS.normal}
                stroke={fixed ? COLORS.fixedLine : COLORS.line}
              />
              <text x={x} y={y} fontSize={fontSize}>
                {label}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="controls">
        <div className="row">
        <button onClick={play}>
          <PlayIcon /> Play
        </button>
        <button
          onClick={() => {
            setBoard(startBoard())
            setDrag(null)
          }}
        >
          Reiniciar
        </button>
        </div>
        <div className="row">
        <select
          ref={selRef}
          value={keyLetter}
          onChange={(e) => setKeyLetter(e.target.value)}
          aria-label="Tonalidad: nombres de las notas en las fichas"
        >
          <option value="">Tonalidad</option>
          {[0, 1, 2, 3, 4, 5, 6].map((l) => (
            <option key={l} value={l}>
              {letterName(l, system)}
            </option>
          ))}
        </select>
        <select
          ref={accRef}
          value={keyAcc}
          onChange={(e) => setKeyAcc(+e.target.value)}
          disabled={keyLetter === ''}
          aria-label="Alteración de la tonalidad: natural, sostenido o bemol"
        >
          <option value={0}></option>
          <option value={1}>♯</option>
          <option value={-1}>♭</option>
        </select>
        <select
          ref={notRef}
          value={notation}
          style={{ width: 'min-content' }}
          onChange={(e) => setNotation(e.target.value)}
          aria-label="Cifrado de las notas"
        >
          <option value="">Cifrado</option>
          {NOTATIONS.map(([id, text]) => (
            <option key={id} value={id}>
              {text}
            </option>
          ))}
        </select>
        </div>
      </div>
    </main>
  )
}
