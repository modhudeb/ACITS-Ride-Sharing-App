_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"


def bounds(cell: str) -> tuple[float, float, float, float]:
    """Decode a geohash cell to its (lat_min, lat_max, lng_min, lng_max) box.
    Lets tables that store raw lat/lng (e.g. rides.pickup_lat/lng) be queried
    by zone with two range predicates instead of needing a geohash column."""
    lat_range = [-90.0, 90.0]
    lng_range = [-180.0, 180.0]
    even = True
    for ch in cell:
        idx = _BASE32.index(ch)
        for bit in (16, 8, 4, 2, 1):
            r = lng_range if even else lat_range
            mid = (r[0] + r[1]) / 2
            if idx & bit:
                r[0] = mid
            else:
                r[1] = mid
            even = not even
    return lat_range[0], lat_range[1], lng_range[0], lng_range[1]


def encode(lat: float, lng: float, precision: int = 9) -> str:
    lat_range = [-90.0, 90.0]
    lng_range = [-180.0, 180.0]
    geohash = []
    bits = [16, 8, 4, 2, 1]
    bit = 0
    ch = 0
    even = True

    while len(geohash) < precision:
        if even:
            mid = (lng_range[0] + lng_range[1]) / 2
            if lng > mid:
                ch |= bits[bit]
                lng_range[0] = mid
            else:
                lng_range[1] = mid
        else:
            mid = (lat_range[0] + lat_range[1]) / 2
            if lat > mid:
                ch |= bits[bit]
                lat_range[0] = mid
            else:
                lat_range[1] = mid
        even = not even

        if bit < 4:
            bit += 1
        else:
            geohash.append(_BASE32[ch])
            bit = 0
            ch = 0

    return "".join(geohash)
