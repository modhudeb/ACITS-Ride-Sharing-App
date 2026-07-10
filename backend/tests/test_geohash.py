from app.services.geohash import encode


def test_known_value():
    # "wh0r" is the publicly documented geohash prefix for central Dhaka;
    # the 5th char pins current behavior as a regression guard.
    assert encode(23.8103, 90.4125, precision=4) == "wh0r"
    assert encode(23.8103, 90.4125, precision=5) == "wh0r3"


def test_nearby_points_share_prefix():
    a = encode(23.8103, 90.4125)
    b = encode(23.8110, 90.4130)  # a few hundred meters away
    assert a[:5] == b[:5]


def test_distant_points_differ():
    dhaka = encode(23.8103, 90.4125)
    chittagong = encode(22.3569, 91.7832)
    assert dhaka[:3] != chittagong[:3]


def test_precision_controls_length():
    assert len(encode(0, 0, precision=7)) == 7
    assert len(encode(0, 0, precision=9)) == 9
