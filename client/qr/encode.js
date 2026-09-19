/* ============================================================================
   A QR SYMBOL, FOR ONE URL, COMPUTED HERE

     encodeQr(text) -> { size, modules }        modules[y][x] is 0 or 1

   WHY THIS IS IN THE REPOSITORY RATHER THAN INSTALLED.

   This function is handed a live invitation credential. Everything that touches
   one in MetYet is code this project can read in a sitting — the same reason
   server/mail/resend.js talks to a mail provider over bare `fetch` instead of
   taking its SDK. A QR encoder is a closed problem against a frozen standard
   (ISO/IEC 18004, unchanged since 2000): there is no upstream to track, no
   algorithm agility to inherit, and no CVE surface to keep up with. Taking a
   package here would add a supply chain to the one path that holds the
   plaintext, and buy nothing that expires.

   That reasoning does NOT generalise to every dependency. `jose` is installed
   precisely because token verification is security-critical and DOES evolve.
   Error correction for a fixed 60-byte URL does not.

   WHAT IT DELIBERATELY DOES NOT DO. No Kanji, no numeric or alphanumeric mode,
   no error-correction level but M, and no version above 6. That is not
   laziness — it is the whole specification this product needs, and every line
   that is not here is a line that cannot be wrong. Versions above 6 would also
   require version-information blocks, which is exactly the kind of complexity
   an invitation link never justifies.

   Byte mode at level M reaches 106 characters at version 6, against roughly 60
   for `https://app.metyet.io/join#<32 symbols>` — room for a much longer origin
   without touching this file.

   VERIFIED BY SOMEBODY ELSE'S DECODER. The focused suite renders the output to
   pixels and reads it back with `jsqr`, an independent implementation, so the
   claim "a phone can scan this" rests on more than this file agreeing with
   itself.
   ========================================================================== */

/* ------------------------------------------------------------ GF(256)

   Arithmetic over the field the standard names: primitive polynomial 0x11D,
   generator 2. Logs and antilogs are built once so multiplication is two table
   lookups and an addition. */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/* The generator polynomial for `degree` error-correction codewords:
   (x - α⁰)(x - α¹)…(x - α^(degree-1)), coefficients highest power first. */
function generatorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= mul(poly[j], 1);              /* × x  */
      next[j + 1] ^= mul(poly[j], EXP[i]);     /* × α^i */
    }
    poly = next;
  }
  return poly;
}

/* Reed-Solomon remainder: the error-correction codewords for one block. */
function remainder(data, degree) {
  const gen = generatorPoly(degree);
  const out = new Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ out[0];
    out.shift();
    out.push(0);
    for (let i = 0; i < degree; i += 1) out[i] ^= mul(gen[i + 1], factor);
  }
  return out;
}

/* ------------------------------------------------- the versions we support

   Level M, byte mode, versions 1 to 6. Each entry is the block structure the
   standard specifies: how many blocks, how many data codewords in each, and how
   many error-correction codewords each block carries.

   `capacity` is derived rather than listed, so the table cannot disagree with
   itself: total data codewords, less the two bytes the mode indicator and the
   character count occupy. */
const VERSIONS = [
  { version: 1, blocks: [16], ec: 10 },
  { version: 2, blocks: [28], ec: 16 },
  { version: 3, blocks: [44], ec: 26 },
  { version: 4, blocks: [32, 32], ec: 18 },
  { version: 5, blocks: [43, 43], ec: 24 },
  { version: 6, blocks: [27, 27, 27, 27], ec: 16 },
].map((v) => {
  const dataCodewords = v.blocks.reduce((n, b) => n + b, 0);
  return { ...v, dataCodewords, capacity: dataCodewords - 2 };
});

/* One alignment pattern from version 2, at the centre the standard gives. */
const ALIGNMENT_CENTRE = { 2: 18, 3: 22, 4: 26, 5: 30, 6: 34 };

const sizeOf = (version) => 17 + 4 * version;
const bit = (value, i) => (value >>> i) & 1;

class QrError extends Error {
  constructor(message) {
    super(message);
    this.name = "QrError";
  }
}

/* ------------------------------------------------------------ the bit stream */
function bitsFor(bytes, version) {
  const out = [];
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i -= 1) out.push(bit(value, i));
  };
  push(0b0100, 4);                       /* byte mode                       */
  push(bytes.length, 8);                 /* count: 8 bits for versions 1–9  */
  for (const b of bytes) push(b, 8);

  const total = version.dataCodewords * 8;
  push(0, Math.min(4, total - out.length));            /* terminator        */
  while (out.length % 8 !== 0) out.push(0);            /* to a byte edge    */

  const codewords = [];
  for (let i = 0; i < out.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | out[i + j];
    codewords.push(byte);
  }
  /* The standard's own padding, alternating, until the block is full. */
  for (let i = 0; codewords.length < version.dataCodewords; i += 1) {
    codewords.push(i % 2 === 0 ? 0xec : 0x11);
  }
  return codewords;
}

/* Data codewords in, the interleaved final sequence out. */
function interleave(codewords, version) {
  const blocks = [];
  let at = 0;
  for (const length of version.blocks) {
    const data = codewords.slice(at, at + length);
    at += length;
    blocks.push({ data, ec: remainder(data, version.ec) });
  }
  const out = [];
  const longest = Math.max(...version.blocks);
  for (let i = 0; i < longest; i += 1) {
    for (const block of blocks) if (i < block.data.length) out.push(block.data[i]);
  }
  for (let i = 0; i < version.ec; i += 1) {
    for (const block of blocks) out.push(block.ec[i]);
  }
  return out;
}

/* ------------------------------------------------------ the function patterns */
function blankMatrix(size) {
  const modules = [];
  const reserved = [];
  for (let y = 0; y < size; y += 1) {
    modules.push(new Array(size).fill(0));
    reserved.push(new Array(size).fill(false));
  }
  return { modules, reserved };
}

function drawFunctionPatterns(modules, reserved, version) {
  const size = sizeOf(version.version);
  const set = (x, y, dark) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    modules[y][x] = dark ? 1 : 0;
    reserved[y][x] = true;
  };

  /* Three finders, each with its separator. */
  for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
    for (let dy = -1; dy <= 7; dy += 1) {
      for (let dx = -1; dx <= 7; dx += 1) {
        const x = ox + dx;
        const y = oy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        set(x, y, ring !== 2 && ring <= 3);
      }
    }
  }

  /* Timing, between the finders. */
  for (let i = 8; i < size - 8; i += 1) {
    set(i, 6, i % 2 === 0);
    set(6, i, i % 2 === 0);
  }

  /* One alignment pattern, from version 2 onwards. */
  const centre = ALIGNMENT_CENTRE[version.version];
  if (centre) {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        set(centre + dx, centre + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  /* The module that is always dark, and the space the format bits will take. */
  set(8, size - 8, true);
  for (let i = 0; i <= 8; i += 1) { set(8, i, modules[i][8] === 1); set(i, 8, modules[8][i] === 1); }
  for (let i = 0; i < 8; i += 1) { set(size - 1 - i, 8, false); set(8, size - 1 - i, false); }
  set(8, size - 8, true);
}

/* The 15 format bits: level M, this mask, BCH(15,5), then the standard's XOR. */
function formatBits(mask) {
  const data = (0b00 << 3) | mask;               /* level M is 0b00 */
  let rem = data;
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function drawFormat(modules, version, mask) {
  const size = sizeOf(version.version);
  const bits = formatBits(mask);
  for (let i = 0; i <= 5; i += 1) modules[i][8] = bit(bits, i);
  modules[7][8] = bit(bits, 6);
  modules[8][8] = bit(bits, 7);
  modules[8][7] = bit(bits, 8);
  for (let i = 9; i < 15; i += 1) modules[8][14 - i] = bit(bits, i);

  for (let i = 0; i < 8; i += 1) modules[8][size - 1 - i] = bit(bits, i);
  for (let i = 8; i < 15; i += 1) modules[size - 15 + i][8] = bit(bits, i);
  modules[size - 8][8] = 1;
}

/* The zig-zag, two columns at a time, right to left, skipping the timing
   column and every module a function pattern already owns. */
function placeData(modules, reserved, version, sequence) {
  const size = sizeOf(version.version);
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - step : step;
        if (reserved[y][x]) continue;
        if (i < sequence.length * 8) {
          modules[y][x] = bit(sequence[i >>> 3], 7 - (i & 7));
          i += 1;
        }
        /* Anything past the data is a remainder bit, and stays light. */
      }
    }
  }
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

const applyMask = (modules, reserved, size, mask) => {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!reserved[y][x] && MASKS[mask](x, y)) modules[y][x] ^= 1;
    }
  }
};

/* THE FOUR PENALTIES, which are what makes a symbol readable rather than merely
   correct. A symbol with long runs, large blocks of one colour, finder-like
   sequences or a lopsided dark ratio is legal and hard to scan; the standard
   scores all eight masks and keeps the best. */
function penalty(modules, size) {
  let score = 0;

  const runScore = (line) => {
    let total = 0;
    let run = 1;
    for (let i = 1; i < line.length; i += 1) {
      if (line[i] === line[i - 1]) {
        run += 1;
        if (run === 5) total += 3;
        else if (run > 5) total += 1;
      } else run = 1;
    }
    return total;
  };
  for (let y = 0; y < size; y += 1) score += runScore(modules[y]);
  for (let x = 0; x < size; x += 1) score += runScore(modules.map((row) => row[x]));

  /* Blocks of 2×2 in one colour. */
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const v = modules[y][x];
      if (v === modules[y][x + 1] && v === modules[y + 1][x] && v === modules[y + 1][x + 1]) score += 3;
    }
  }

  /* 1:1:3:1:1 with four light modules on either side — the pattern a scanner
     reads as a finder. */
  const FINDER = [1, 0, 1, 1, 1, 0, 1];
  const looksLikeFinder = (line, at) => {
    for (let i = 0; i < 7; i += 1) if (line[at + i] !== FINDER[i]) return false;
    const before = line.slice(Math.max(0, at - 4), at);
    const after = line.slice(at + 7, at + 11);
    const light = (part) => part.length >= 4 && part.every((m) => m === 0);
    return light(before) || light(after);
  };
  const scanLine = (line) => {
    let total = 0;
    for (let i = 0; i + 7 <= line.length; i += 1) if (looksLikeFinder(line, i)) total += 40;
    return total;
  };
  for (let y = 0; y < size; y += 1) score += scanLine(modules[y]);
  for (let x = 0; x < size; x += 1) score += scanLine(modules.map((row) => row[x]));

  /* How far the dark proportion strays from half. */
  let dark = 0;
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) dark += modules[y][x];
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

/* ----------------------------------------------------------------- the symbol */

/* ASCII only, which every URL this product builds already is: the origin comes
   from configuration and the credential from an alphabet of 32 lowercase
   symbols. Anything else is refused rather than silently mangled. */
function bytesOf(text) {
  const out = [];
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    if (code > 0x7f) throw new QrError("encodeQr: the text must be ASCII");
    out.push(code);
  }
  return out;
}

export function encodeQr(text) {
  const bytes = bytesOf(text);
  if (!bytes.length) throw new QrError("encodeQr: there is nothing to encode");
  const version = VERSIONS.find((v) => bytes.length <= v.capacity);
  if (!version) {
    throw new QrError(`encodeQr: ${bytes.length} characters is more than this encoder carries`);
  }

  const size = sizeOf(version.version);
  const sequence = interleave(bitsFor(bytes, version), version);

  let best = null;
  for (let mask = 0; mask < 8; mask += 1) {
    const { modules, reserved } = blankMatrix(size);
    drawFunctionPatterns(modules, reserved, version);
    placeData(modules, reserved, version, sequence);
    applyMask(modules, reserved, size, mask);
    drawFormat(modules, version, mask);
    const score = penalty(modules, size);
    if (!best || score < best.score) best = { score, modules, mask };
  }

  return { size, modules: best.modules, version: version.version, mask: best.mask };
}

export { QrError, VERSIONS };
