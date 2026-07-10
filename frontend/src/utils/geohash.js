const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'

// Mirrors backend/app/services/geohash.py so client-side range queries use
// the exact same cell boundaries the backend writes.
export function encodeGeohash(lat, lng, precision = 9) {
    const latRange = [-90, 90]
    const lngRange = [-180, 180]
    const bits = [16, 8, 4, 2, 1]
    let hash = ''
    let bit = 0
    let ch = 0
    let even = true

    while (hash.length < precision) {
        if (even) {
            const mid = (lngRange[0] + lngRange[1]) / 2
            if (lng > mid) {
                ch |= bits[bit]
                lngRange[0] = mid
            } else {
                lngRange[1] = mid
            }
        } else {
            const mid = (latRange[0] + latRange[1]) / 2
            if (lat > mid) {
                ch |= bits[bit]
                latRange[0] = mid
            } else {
                latRange[1] = mid
            }
        }
        even = !even

        if (bit < 4) {
            bit += 1
        } else {
            hash += BASE32[ch]
            bit = 0
            ch = 0
        }
    }

    return hash
}

// High code point so `<= end` behaves as a prefix match in Firestore.
export const geohashRangeEnd = (prefix) => prefix + ''
