// Datos y reglas musicales del tablero. No depende de React ni del dibujo.

export const NAT = [0, 2, 4, 5, 7, 9, 11, 12] // columnas con hueco natural (franja gris)
export const BLK = [1, 3, 6, 8, 10] // columnas con huecos de alteración (# arriba, b abajo)

// Cada hueco: columna (semitono desde la tónica) y carril (0 franja, -1 arriba, +1 abajo).
// ids: n = natural, t = arriba (#), b = abajo (b). El hueco de arriba de la columna 1 no existe.
export const HOLES = {}
NAT.forEach((c) => {
  HOLES['n' + c] = { col: c, lane: 0 }
})
BLK.forEach((c) => {
  if (c !== 1) HOLES['t' + c] = { col: c, lane: -1 }
  HOLES['b' + c] = { col: c, lane: 1 }
})

// Rieles: [hueco natural, hueco de alteración]
export const RAILS = [
  ['n2', 't3'],
  ['n2', 'b1'],
  ['n4', 'b3'],
  ['n5', 't6'],
  ['n7', 't8'],
  ['n7', 'b6'],
  ['n9', 't10'],
  ['n9', 'b8'],
  ['n11', 'b10'],
]

// Hueco de cada ficha al empezar (escala mayor). La primera y la última son fijas.
export const INIT = ['n0', 'n2', 'n4', 'n5', 'n7', 'n9', 'n11', 'n12']

// Escalas que el título sabe reconocer (semitonos desde la tónica)
const SCALES = [
  ['Escala mayor (modo jónico)', [0, 2, 4, 5, 7, 9, 11]],
  ['Escala menor natural (modo eólico)', [0, 2, 3, 5, 7, 8, 10]],
  ['Escala menor armónica', [0, 2, 3, 5, 7, 8, 11]],
  ['Escala menor melódica (ascendente)', [0, 2, 3, 5, 7, 9, 11]],
  ['Modo dórico', [0, 2, 3, 5, 7, 9, 10]],
  ['Modo frigio', [0, 1, 3, 5, 7, 8, 10]],
  ['Modo lidio', [0, 2, 4, 6, 7, 9, 11]],
  ['Modo mixolidio', [0, 2, 4, 5, 7, 9, 10]],
  ['Modo locrio', [0, 1, 3, 5, 6, 8, 10]],
  ['Modo lidio dominante', [0, 2, 4, 6, 7, 9, 10]],
  ['Modo frigio dominante', [0, 1, 4, 5, 7, 8, 10]],
  ['Escala doble armónica', [0, 1, 4, 5, 7, 8, 11]],
  ['Escala pentatónica mayor', [0, 2, 4, 7, 9]],
  ['Escala pentatónica menor', [0, 3, 5, 7, 10]],
  ['Escala de blues menor', [0, 3, 5, 6, 7, 10]],
  ['Escala de blues mayor', [0, 2, 3, 4, 7, 9]],
  ['Escala de tonos enteros', [0, 2, 4, 6, 8, 10]],
  ['Escala disminuida (tono-semitono)', [0, 2, 3, 5, 6, 8, 9, 11]],
  ['Escala disminuida (semitono-tono)', [0, 1, 3, 4, 6, 7, 9, 10]],
  ['Escala cromática', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]],
]

// Recibe las columnas ocupadas y devuelve el nombre de la escala, o '' si no es ninguna conocida
export function scaleTitle(cols) {
  const key = [...new Set(cols.map((c) => c % 12))].sort((a, b) => a - b).join()
  return SCALES.find(([, steps]) => steps.join() === key)?.[0] ?? ''
}

// ---- Nombres de notas (opcionales, según la tonalidad mayor elegida) ----

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11]
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12]

// Tonalidades mayores: letra (índice en LETTERS) y alteración de la tónica
export const KEYS = [
  { label: 'Do♭', letter: 0, acc: -1 },
  { label: 'Sol♭', letter: 4, acc: -1 },
  { label: 'Re♭', letter: 1, acc: -1 },
  { label: 'La♭', letter: 5, acc: -1 },
  { label: 'Mi♭', letter: 2, acc: -1 },
  { label: 'Si♭', letter: 6, acc: -1 },
  { label: 'Fa', letter: 3, acc: 0 },
  { label: 'Do', letter: 0, acc: 0 },
  { label: 'Sol', letter: 4, acc: 0 },
  { label: 'Re', letter: 1, acc: 0 },
  { label: 'La', letter: 5, acc: 0 },
  { label: 'Mi', letter: 2, acc: 0 },
  { label: 'Si', letter: 6, acc: 0 },
  { label: 'Fa♯', letter: 3, acc: 1 },
  { label: 'Do♯', letter: 0, acc: 1 },
]

// Grado de cada hueco natural (0 a 7) y, para los de alteración, su hueco natural y desplazamiento
const DEGREE = {}
NAT.forEach((c, i) => {
  DEGREE['n' + c] = i
})
const PARENT = {}
NAT.forEach((c) => {
  PARENT['n' + c] = ['n' + c, 0]
})
RAILS.forEach(([n, a]) => {
  PARENT[a] = [n, a[0] === 't' ? 1 : -1]
})

const accidental = (a) =>
  a === 0 ? '' : a === 1 ? '♯' : a === 2 ? 'x' : a === -1 ? '♭' : a === -2 ? '♭♭' : (a > 0 ? '♯' : '♭') + Math.abs(a)

// Nombre de la nota que corresponde a un hueco, o '' si no hay tonalidad o hueco
export function noteName(key, id) {
  if (!key || !id) return ''
  const [parent, shift] = PARENT[id]
  const d = DEGREE[parent]
  const li = (key.letter + d) % 7
  const rootPc = (LETTER_PC[key.letter] + key.acc + 120) % 12
  const target = (rootPc + MAJOR[d]) % 12
  let a = (((target - LETTER_PC[li]) % 12) + 12) % 12
  if (a > 6) a -= 12
  return LETTERS[li] + accidental(a + shift)
}

// Frecuencia: la tónica (columna 0) siempre suena en un Do central
export const freq = (col) => 261.63 * 2 ** (col / 12)
