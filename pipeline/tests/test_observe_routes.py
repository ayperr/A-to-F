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


def test_route_is_confirmed_only_by_a_takeoff_or_landing_at_its_airports():
    jfk, lgb, lax = {"iata": "JFK", "lat": 40.64, "lon": -73.78}, {"iata": "LGB", "lat": 33.82, "lon": -118.15}, {"iata": "LAX", "lat": 33.94, "lon": -118.41}
    cruising = {"number": "B6 1", "origin": jfk, "dest": lax, "lat": 39.0, "lon": -100.0, "alt_m": 11000}
    landing_lax = {"number": "B6 1", "origin": jfk, "dest": lax, "lat": 33.95, "lon": -118.30, "alt_m": 600}
    stale = {"number": "B6 9", "origin": jfk, "dest": lgb, "lat": 33.95, "lon": -118.30, "alt_m": 600}   # really landing at LAX
    s, _ = merge(None, [cruising], "t1")
    assert "confirmed" not in s["routes"]["JFK-LAX"]
    s, _ = merge(s, [landing_lax, stale], "t2")
    assert s["routes"]["JFK-LAX"]["confirmed"] == {"LAX": "B6 1 t2"}
    assert "confirmed" not in s["routes"]["JFK-LGB"]   # 17 km from LGB: not close enough


def test_only_confirmed_observed_routes_are_mapped(tmp_path, monkeypatch):
    import json
    import airports
    obs = {"routes": {
        "BOS-SFO": {"origin": "BOS", "dest": "SFO", "confirmed": {"SFO": "B6 333 2026-11-12T22:00:00+00:00"}},
        "BOS-LAS": {"origin": "BOS", "dest": "LAS"},                                     # never seen low: not mapped
        "JFK-LAX": {"origin": "JFK", "dest": "LAX", "confirmed": {"JFK": "B6 23 t"}},   # already a core pair
        "JFK-XXX": {"origin": "JFK", "dest": "XXX", "confirmed": {"JFK": "B6 9 t"}},    # airport unknown
    }}
    (tmp_path / "observed_routes.json").write_text(json.dumps(obs))
    monkeypatch.setattr(airports, "HERE", tmp_path)
    pairs = airports._observed_pairs()
    assert [(o, d) for o, d, _, _ in pairs] == [("BOS", "SFO")]
    assert pairs[0][3].startswith("seen at SFO on the A to F live list, 2026-11-12")
