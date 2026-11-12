from observe_routes import merge


def fl(number, o, d):
    return {"number": number, "origin": {"iata": o} if o else None, "dest": {"iata": d} if d else None}


def test_merge_collects_pairs_and_flight_numbers():
    s, new = merge(None, [fl("B6 615", "JFK", "SFO"), fl("B6 23", "JFK", "LAX"), fl("B6 9", None, None)], "t1")
    assert new == ["JFK-SFO", "JFK-LAX"]
    assert list(s["routes"]) == ["JFK-LAX", "JFK-SFO"]
    s, new = merge(s, [fl("B6 1615", "JFK", "SFO"), fl("B6 615", "JFK", "SFO"), fl("B6 7", "BOS", "BOS")], "t2")
    assert new == []
    r = s["routes"]["JFK-SFO"]
    assert r["flights"] == ["B6 615", "B6 1615"]
    assert (r["first_seen"], r["last_seen"], r["sightings"]) == ("t1", "t2", 3)
    assert s["snapshots"] == 2 and s["started"] == "t1" and s["updated"] == "t2"
    assert "BOS-BOS" not in s["routes"]
