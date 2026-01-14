/**
 * CHUCK - Chat Harvesting Universal Connection Kit
 * UUIDv5 implementation for deterministic message IDs
 *
 * Based on uuid library - generates deterministic UUIDs from namespace + name
 * Used to deduplicate messages across reconnections/refreshes
 */

const UUID_REGEX = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;

// Byte to hex lookup table
const byteToHex = [];
for (let i = 0; i < 256; ++i) {
    byteToHex.push((i + 256).toString(16).substr(1));
}

function validate(uuid) {
    return typeof uuid === 'string' && UUID_REGEX.test(uuid);
}

function parse(uuid) {
    if (!validate(uuid)) {
        throw TypeError('Invalid UUID');
    }

    const bytes = new Uint8Array(16);
    let v;

    v = parseInt(uuid.slice(0, 8), 16);
    bytes[0] = v >>> 24;
    bytes[1] = v >>> 16 & 255;
    bytes[2] = v >>> 8 & 255;
    bytes[3] = 255 & v;

    v = parseInt(uuid.slice(9, 13), 16);
    bytes[4] = v >>> 8;
    bytes[5] = 255 & v;

    v = parseInt(uuid.slice(14, 18), 16);
    bytes[6] = v >>> 8;
    bytes[7] = 255 & v;

    v = parseInt(uuid.slice(19, 23), 16);
    bytes[8] = v >>> 8;
    bytes[9] = 255 & v;

    v = parseInt(uuid.slice(24, 36), 16);
    bytes[10] = v / 1099511627776 & 255;
    bytes[11] = v / 4294967296 & 255;
    bytes[12] = v >>> 24 & 255;
    bytes[13] = v >>> 16 & 255;
    bytes[14] = v >>> 8 & 255;
    bytes[15] = 255 & v;

    return bytes;
}

function stringify(bytes, offset = 0) {
    const uuid = (
        byteToHex[bytes[offset + 0]] +
        byteToHex[bytes[offset + 1]] +
        byteToHex[bytes[offset + 2]] +
        byteToHex[bytes[offset + 3]] + '-' +
        byteToHex[bytes[offset + 4]] +
        byteToHex[bytes[offset + 5]] + '-' +
        byteToHex[bytes[offset + 6]] +
        byteToHex[bytes[offset + 7]] + '-' +
        byteToHex[bytes[offset + 8]] +
        byteToHex[bytes[offset + 9]] + '-' +
        byteToHex[bytes[offset + 10]] +
        byteToHex[bytes[offset + 11]] +
        byteToHex[bytes[offset + 12]] +
        byteToHex[bytes[offset + 13]] +
        byteToHex[bytes[offset + 14]] +
        byteToHex[bytes[offset + 15]]
    ).toLowerCase();

    if (!validate(uuid)) {
        throw TypeError('Stringified UUID is invalid');
    }

    return uuid;
}

// SHA-1 helper functions
function f(s, x, y, z) {
    switch (s) {
        case 0: return x & y ^ ~x & z;
        case 1: return x ^ y ^ z;
        case 2: return x & y ^ x & z ^ y & z;
        case 3: return x ^ y ^ z;
    }
}

function rotl(x, n) {
    return x << n | x >>> 32 - n;
}

function sha1(data) {
    const K = [1518500249, 1859775393, 2400959708, 3395469782];
    const H = [1732584193, 4023233417, 2562383102, 271733878, 3285377520];

    let bytes;
    if (typeof data === 'string') {
        const encoded = unescape(encodeURIComponent(data));
        bytes = [];
        for (let i = 0; i < encoded.length; ++i) {
            bytes.push(encoded.charCodeAt(i));
        }
    } else if (Array.isArray(data)) {
        bytes = data;
    } else {
        bytes = Array.prototype.slice.call(data);
    }

    bytes.push(128);

    const l = bytes.length / 4 + 2;
    const N = Math.ceil(l / 16);
    const M = new Array(N);

    for (let i = 0; i < N; ++i) {
        const block = new Uint32Array(16);
        for (let j = 0; j < 16; ++j) {
            block[j] = bytes[64 * i + 4 * j] << 24 |
                       bytes[64 * i + 4 * j + 1] << 16 |
                       bytes[64 * i + 4 * j + 2] << 8 |
                       bytes[64 * i + 4 * j + 3];
        }
        M[i] = block;
    }

    M[N - 1][14] = Math.floor(8 * (bytes.length - 1) / Math.pow(2, 32));
    M[N - 1][15] = 8 * (bytes.length - 1) & 4294967295;

    for (let i = 0; i < N; ++i) {
        const W = new Uint32Array(80);

        for (let t = 0; t < 16; ++t) {
            W[t] = M[i][t];
        }

        for (let t = 16; t < 80; ++t) {
            W[t] = rotl(W[t - 3] ^ W[t - 8] ^ W[t - 14] ^ W[t - 16], 1);
        }

        let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4];

        for (let t = 0; t < 80; ++t) {
            const s = Math.floor(t / 20);
            const T = rotl(a, 5) + f(s, b, c, d) + e + K[s] + W[t] >>> 0;
            e = d;
            d = c;
            c = rotl(b, 30) >>> 0;
            b = a;
            a = T;
        }

        H[0] = H[0] + a >>> 0;
        H[1] = H[1] + b >>> 0;
        H[2] = H[2] + c >>> 0;
        H[3] = H[3] + d >>> 0;
        H[4] = H[4] + e >>> 0;
    }

    return [
        H[0] >> 24 & 255, H[0] >> 16 & 255, H[0] >> 8 & 255, 255 & H[0],
        H[1] >> 24 & 255, H[1] >> 16 & 255, H[1] >> 8 & 255, 255 & H[1],
        H[2] >> 24 & 255, H[2] >> 16 & 255, H[2] >> 8 & 255, 255 & H[2],
        H[3] >> 24 & 255, H[3] >> 16 & 255, H[3] >> 8 & 255, 255 & H[3],
        H[4] >> 24 & 255, H[4] >> 16 & 255, H[4] >> 8 & 255, 255 & H[4]
    ];
}

/**
 * Generate a v5 UUID from a name and namespace
 * @param {string} name - The name to hash
 * @param {string} namespace - The namespace UUID
 * @returns {string} The generated UUID
 */
export function uuidv5(name, namespace) {
    // Convert name to bytes
    let nameBytes;
    if (typeof name === 'string') {
        const encoded = unescape(encodeURIComponent(name));
        nameBytes = [];
        for (let i = 0; i < encoded.length; ++i) {
            nameBytes.push(encoded.charCodeAt(i));
        }
    } else {
        nameBytes = name;
    }

    // Parse namespace
    let namespaceBytes;
    if (typeof namespace === 'string') {
        namespaceBytes = parse(namespace);
    } else {
        namespaceBytes = namespace;
    }

    if (namespaceBytes.length !== 16) {
        throw TypeError('Namespace must be array-like (16 iterable integer values, 0-255)');
    }

    // Concatenate namespace and name
    const bytes = new Uint8Array(16 + nameBytes.length);
    bytes.set(namespaceBytes);
    bytes.set(nameBytes, namespaceBytes.length);

    // Hash and set version/variant bits
    const hash = sha1(bytes);
    hash[6] = 15 & hash[6] | 80; // version 5
    hash[8] = 63 & hash[8] | 128; // variant

    return stringify(hash);
}

// Well-known namespaces
uuidv5.DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
uuidv5.URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

export default uuidv5;
