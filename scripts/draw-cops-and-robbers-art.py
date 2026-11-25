"""Bake the hand-drawn pixel atlases and inventory sprites. Requires Pillow."""

from pathlib import Path

from PIL import Image, ImageDraw


ASSETS = (Path(__file__).resolve().parents[1] / "mods/cops-and-robbers/src/main/resources"
          / "assets/cops_robbers")
INK = "#192236"
GOLD = "#f8c666"
CREAM = "#f8ecd6"
GLASS = "#407290"


def rectangle(draw, rect, color):
    x, y, width, height = rect
    if width > 0 and height > 0:
        draw.rectangle((x, y, x + width - 1, y + height - 1), fill=color)


def cuboid(draw, origin, size, palette):
    """Paint Minecraft's cuboid UV unwrap and return the face rectangles."""
    u, v = origin
    w, h, d = size
    faces = {
        "left": (u, v + d, d, h),
        "front": (u + d, v + d, w, h),
        "right": (u + d + w, v + d, d, h),
        "back": (u + 2 * d + w, v + d, w, h),
        "top": (u + d, v, w, d),
        "bottom": (u + d + w, v, w, d),
    }
    base, shade, light = palette
    for face, rect in faces.items():
        x, y, fw, fh = rect
        rectangle(draw, rect, shade if face in {"back", "bottom"} else base)
        rectangle(draw, (x, y, fw, 1), light)
        if fh > 2:
            rectangle(draw, (x, y + fh - 1, fw, 1), shade)
    return faces


def detail(draw, face, rect, color):
    x, y, _, _ = face
    dx, dy, w, h = rect
    rectangle(draw, (x + dx, y + dy, w, h), color)


def uniform(name, skin, hair, coat, trousers, trim):
    image = Image.new("RGBA", (128, 128))
    draw = ImageDraw.Draw(image)
    face = cuboid(draw, (0, 0), (8, 8, 8), skin)
    for side in ("left", "right", "back"):
        detail(draw, face[side], (0, 0, 8, 3 if side != "back" else 6), hair)
        detail(draw, face[side], (0, 4, 1, 2), skin[1])
    rectangle(draw, face["top"], hair)
    front = face["front"]
    detail(draw, front, (0, 0, 8, 1), hair)
    detail(draw, front, (0, 1, 1, 4), hair)
    detail(draw, front, (7, 1, 1, 4), hair)
    if name == "bank_robber":
        detail(draw, front, (0, 2, 8, 3), "#241e34")
        detail(draw, front, (1, 6, 6, 2), "#a2515f")
    for eye in (1, 5):
        detail(draw, front, (eye, 3, 2, 1), CREAM)
        detail(draw, front, (eye + 1, 3, 1, 1), "#172638")
    detail(draw, front, (3, 5, 2, 1), skin[1])
    if name == "teller":
        detail(draw, front, (3, 3, 2, 1), GOLD)

    body = cuboid(draw, (16, 16), (8, 12, 4), coat)
    for side in ("front", "left", "right", "back"):
        _, _, width, _ = body[side]
        detail(draw, body[side], (0, 9, width, 2), trousers[1])
        if name == "bank_robber":
            for row in (2, 5, 8):
                detail(draw, body[side], (0, row, width, 1), trim)
        if name == "fireman":
            for row in (4, 8):
                detail(draw, body[side], (0, row, width, 1), trim)
    detail(draw, body["front"], (3, 2, 2, 8), coat[1])
    detail(draw, body["front"], (3, 9, 2, 1), GOLD)
    if name == "cop":
        detail(draw, body["front"], (1, 2, 2, 1), GOLD)
        detail(draw, body["front"], (1, 3, 1, 1), "#ffe4a2")
        detail(draw, body["front"], (5, 4, 2, 2), coat[2])
        detail(draw, body["back"], (2, 2, 4, 1), trim)
    if name == "teller":
        detail(draw, body["front"], (2, 1, 4, 2), CREAM)
        detail(draw, body["front"], (3, 2, 2, 5), "#9e3d58")
        detail(draw, body["front"], (5, 4, 2, 1), GOLD)
    if name == "bank_robber":
        for index in range(5):
            detail(draw, body["front"], (index + 1, index + 2, 1, 2), "#6e4555")

    for v in (16, 32):
        arms = cuboid(draw, (40, v), (4, 12, 4), coat)
        legs = cuboid(draw, (0, v), (4, 12, 4), trousers)
        for side in ("left", "right", "front", "back"):
            detail(draw, arms[side], (0, 8, 4, 1), trim)
            detail(draw, arms[side], (0, 10, 4, 2), skin[0] if name != "fireman" else trousers[1])
            detail(draw, legs[side], (0, 9, 4, 3), "#232637")
            detail(draw, legs[side], (0, 10, 4, 1), "#41455b")
            if name == "fireman":
                detail(draw, legs[side], (0, 7, 4, 1), trim)

    cap = cuboid(draw, (0, 54), (9, 3, 9), ("#65445f", "#392639", "#926274"))
    detail(draw, cap["front"], (0, 2, 9, 1), "#c98478")
    cap = cuboid(draw, (40, 54), (9, 3, 9), ("#24436e", "#172940", "#4775a5"))
    detail(draw, cap["front"], (3, 1, 3, 1), GOLD)
    cuboid(draw, (80, 54), (8, 1, 3), ("#263347", "#101923", "#405166"))
    helmet = cuboid(draw, (0, 70), (10, 3, 10), ("#bc3843", "#712431", "#f16c54"))
    detail(draw, helmet["front"], (3, 1, 4, 2), GOLD)
    detail(draw, helmet["front"], (4, 1, 2, 1), CREAM)
    cuboid(draw, (42, 70), (11, 1, 12), ("#792c43", "#3e2436", "#bc5558"))
    cuboid(draw, (111, 54), (4, 2, 3), ("#dfa63b", "#915425", "#ffe5a1"))
    cuboid(draw, (0, 98), (4, 5, 3), ("#936445", "#5e3d34", "#c59355"))
    cuboid(draw, (18, 98), (2, 4, 1), ("#101c32", "#0b1222", "#72bddb"))
    cuboid(draw, (26, 98), (1, 3, 1), ("#283448", "#171e2b", "#8997a4"))
    tank = cuboid(draw, (34, 98), (6, 8, 3), ("#83969d", "#3f555f", "#d3e2dd"))
    detail(draw, tank["back"], (0, 3, 6, 1), GOLD)
    cuboid(draw, (55, 98), (2, 2, 2), ("#bb904a", "#624e34", "#f5d081"))
    clip = cuboid(draw, (66, 98), (4, 6, 1), ("#bd895d", "#78503d", "#efcb94"))
    detail(draw, clip["front"], (0, 1, 4, 4), "#ede2cf")
    detail(draw, clip["front"], (1, 2, 2, 1), "#72918e")
    detail(draw, clip["front"], (1, 4, 2, 1), "#72918e")
    image.save(ASSETS / "textures/entity" / f"{name}.png")


def vehicle(name, fire):
    image = Image.new("RGBA", (256, 128))
    draw = ImageDraw.Draw(image)
    armor = ("#a63b44", "#622331", "#ff7661") if fire else ("#294269", "#182841", "#6086b1")
    silver = ("#7a99aa", "#40566b", "#c8dde3")
    dark = ("#283247", "#181c2b", "#57626d")
    width, depth = (32, 46) if fire else (26, 38)
    chassis = cuboid(draw, (0, 0), (width, 6, depth), armor)
    for neighbor in ("left", "right"):
        detail(draw, chassis[neighbor], (2, 2, depth - 4, 2), "#ffc474" if fire else "#79accd")
        detail(draw, chassis[neighbor], (5, 4, depth - 10, 1), DARK_FIRE if fire else "#182841")
    for end in ("front", "back"):
        front = chassis[end]
        detail(draw, front, (4, 2, width - 8, 3), "#1e293b")
        detail(draw, front, (5, 3, width - 10, 1), "#8ca9b9")
        lamps = "#eb775f" if end == "back" else "#ffe7b4"
        for x in (1, width - 4):
            detail(draw, front, (x, 1, 3, 2), lamps)
        detail(draw, front, (width // 2 - 2, 4, 4, 1), CREAM)

    cw, ch, cd = (30, 11, 15) if fire else (22, 9, 17)
    cab = cuboid(draw, (0, 56), (cw, ch, cd), armor)
    for side in ("front", "back", "left", "right"):
        use_width = cab[side][2]
        detail(draw, cab[side], (1, 1, use_width - 2, 4), "#213c58")
        detail(draw, cab[side], (2, 1, use_width - 4, 1), "#78b7cd")
        detail(draw, cab[side], (use_width // 2, 1, 1, 4), armor[1])
        if not fire:
            detail(draw, cab[side], (1, 5, use_width - 2, 3), "#e8e6d8")
        if side in ("left", "right"):
            detail(draw, cab[side], (3, 6, 2, 1), GOLD)
            detail(draw, cab[side], (use_width - 5, 6, 3, 2), "#edc779" if fire else "#427cad")
    if fire:
        rear = cuboid(draw, (100, 58), (30, 8, 26), armor)
        for side in ("left", "right"):
            for x in (2, 10, 18):
                detail(draw, rear[side], (x, 1, 6, 6), "#6f8798")
                for row in (2, 4, 6):
                    detail(draw, rear[side], (x, row, 6, 1), "#c2d8da")
                detail(draw, rear[side], (x + 2, 6, 2, 1), "#283549")
        for x in range(2, 27, 4):
            detail(draw, rear["back"], (x, 3, 2, 3), GOLD)
        cuboid(draw, (0, 101), (1, 1, 22), silver)
        cuboid(draw, (52, 113), (6, 1, 1), silver)
        cuboid(draw, (82, 110), (4, 2, 4), silver)
        cuboid(draw, (105, 112), (2, 2, 7), ("#9cd6e3", "#4582a2", "#eaf9ec"))
    else:
        hood = cuboid(draw, (102, 59), (24, 3, 10), armor)
        detail(draw, hood["top"], (9, 2, 6, 5), "#6588ad")
        detail(draw, hood["top"], (10, 3, 4, 2), GOLD)
        cuboid(draw, (102, 78), (24, 2, 9), armor)
    cuboid(draw, (214, 98), (18, 4, 2), dark)
    cuboid(draw, (178, 22), (16, 2, 4), silver)
    cuboid(draw, (178, 0), (6, 2, 4), ("#e85c56", "#8d3246", "#ffe7b8"))
    cuboid(draw, (206, 0), (6, 2, 4), ("#f9bc62", "#bc5345", CREAM) if fire else ("#55bdf6", "#3153a1", "#dcf9ff"))
    tire = cuboid(draw, (178, 38), (4, 8, 8), dark)
    for side in ("left", "right"):
        detail(draw, tire[side], (1, 1, 6, 6), "#384452")
        detail(draw, tire[side], (2, 2, 4, 4), "#2d3643")
    cuboid(draw, (207, 38), (1, 4, 4), silver)
    image.save(ASSETS / "textures/entity" / f"{name}.png")


DARK_FIRE = "#762837"


def building_sprite(name, front, right, roof, accent):
    image = Image.new("RGBA", (32, 32))
    d = ImageDraw.Draw(image)
    d.polygon([(2, 24), (12, 19), (29, 23), (29, 27), (15, 30), (2, 27)], fill=INK)
    d.polygon([(3, 23), (14, 19), (27, 23), (26, 26), (15, 29), (3, 26)], fill="#5d6a80")
    d.polygon([(5, 10), (20, 9), (27, 13), (27, 23), (17, 27), (5, 25)], fill=INK)
    d.polygon([(17, 12), (26, 14), (26, 23), (17, 26)], fill=right)
    d.polygon([(6, 11), (17, 12), (17, 26), (6, 24)], fill=front)
    d.polygon([(4, 10), (15, 5), (28, 10), (28, 13), (17, 17), (4, 13)], fill=INK)
    d.polygon([(5, 10), (15, 6), (27, 10), (17, 14)], fill=roof)
    d.polygon([(5, 12), (17, 15), (27, 11), (27, 13), (17, 16), (5, 13)], fill=accent)
    rectangle(d, (8, 17, 3, 4), GLASS)
    rectangle(d, (13, 18, 3, 7), INK)
    rectangle(d, (14, 18, 2, 4), CREAM if name == "bank_kit" else GLASS)
    d.line([(19, 19), (24, 17)], fill=accent, width=2)
    if name == "bank_kit":
        d.polygon([(9, 9), (13, 7), (18, 9), (14, 11)], fill=GOLD)
    elif name == "fire_station_kit":
        rectangle(d, (8, 18, 8, 6), INK)
        rectangle(d, (9, 22, 6, 1), "#df4f54")
    else:
        d.line([(8, 10), (15, 7), (20, 9)], fill="#9cd4e4", width=2)
    image.save(ASSETS / "textures/item" / f"{name}.png")


def egg_sprite(name, main, shade, trim, pictogram):
    image = Image.new("RGBA", (32, 32))
    d = ImageDraw.Draw(image)
    d.polygon([(12, 2), (19, 2), (23, 5), (27, 12), (28, 21), (25, 27), (19, 30),
               (11, 30), (5, 27), (3, 22), (4, 15), (7, 8)], fill=INK)
    d.polygon([(12, 4), (18, 4), (22, 7), (25, 13), (26, 21), (23, 26), (18, 28),
               (12, 28), (6, 25), (5, 21), (6, 15), (9, 9)], fill=main)
    d.polygon([(24, 12), (26, 17), (26, 22), (23, 26), (18, 28), (12, 28), (8, 26),
               (16, 26), (21, 23), (23, 18)], fill=shade)
    for x, y, size in ((12, 7, 3), (8, 13, 2), (21, 9, 2), (21, 23, 3), (7, 22, 2)):
        rectangle(d, (x, y, size, 2), trim)
    d.rounded_rectangle((9, 12, 23, 23), radius=2, fill=INK)
    pictogram(d)
    image.save(ASSETS / "textures/item" / f"{name}_spawn_egg.png")


def face_sprite(draw, skin, cap, kind):
    rectangle(draw, (12, 15, 8, 6), skin)
    rectangle(draw, (11, 13, 10, 3), cap)
    if kind == "mask":
        rectangle(draw, (11, 16, 10, 3), "#362641")
    if kind == "teller":
        rectangle(draw, (10, 16, 2, 5), cap)
        rectangle(draw, (19, 16, 2, 5), cap)
    for x in (13, 18):
        rectangle(draw, (x, 17, 1, 1), CREAM if kind == "mask" else INK)
    if kind in {"cop", "fire"}:
        rectangle(draw, (15, 13, 2, 2), GOLD)
    rectangle(draw, (15, 20, 2, 1), "#7c4c49")


def truck_sprite(draw, paint, stripe, fire):
    rectangle(draw, (11, 16, 10, 5), paint)
    rectangle(draw, (12, 14, 6 if fire else 7, 3), GLASS)
    rectangle(draw, (12, 16, 8, 1), stripe)
    rectangle(draw, (11, 19, 2, 1), CREAM)
    rectangle(draw, (12, 21, 2, 1), "#8094a4")
    rectangle(draw, (18, 21, 2, 1), "#8094a4")
    if fire:
        rectangle(draw, (17, 14, 4, 1), GOLD)
    else:
        rectangle(draw, (15, 13, 3, 1), "#77d7f1")


def main():
    uniform("bank_robber", ("#c78a72", "#8b544e", "#efb59a"), "#433145",
            ("#514561", "#342c46", "#81778c"), ("#45405b", "#282739", "#635b73"), "#efe2cc")
    uniform("cop", ("#bd836c", "#8c594e", "#e6b292"), "#3b2c35",
            ("#315484", "#223657", "#5882a5"), ("#293d5d", "#1d283b", "#4a6b85"), "#90bcd4")
    uniform("teller", ("#a87150", "#794238", "#e0a67c"), "#392534",
            ("#438b80", "#275b60", "#76b6a0"), ("#495160", "#2c313d", "#697786"), "#e2bf80")
    uniform("fireman", ("#d69d75", "#ac6f56", "#edbd94"), "#57403d",
            ("#6e554b", "#403645", "#a08163"), ("#51484d", "#372f3d", "#74616a"), "#f8cf6e")
    vehicle("police_cruiser", False)
    vehicle("fire_truck", True)

    building_sprite("police_station_kit", "#e2e8dc", "#617d9a", "#5277a6", "#4d98ce")
    building_sprite("fire_station_kit", "#d35650", "#8f3441", "#f3825f", CREAM)
    building_sprite("bank_kit", "#e8cf9f", "#a77e53", "#62a49a", "#bf7e53")
    egg_sprite("bank_robber", "#986182", "#633954", "#e69c99", lambda d: face_sprite(d, "#d48e75", "#764660", "mask"))
    egg_sprite("cop", "#719bc5", "#365582", "#b8e1ec", lambda d: face_sprite(d, "#bf8164", "#395a87", "cop"))
    egg_sprite("teller", "#6dab95", "#437a75", "#c8e0ab", lambda d: face_sprite(d, "#a96d50", "#4a2e40", "teller"))
    egg_sprite("fireman", "#dc9a56", "#b85647", "#ffdd9b", lambda d: face_sprite(d, "#cc946b", "#df584c", "fire"))
    egg_sprite("police_cruiser", "#6d80bf", "#424c85", "#9ec9ee", lambda d: truck_sprite(d, "#b8d3dd", "#5894bb", False))
    egg_sprite("fire_truck", "#e96953", "#b43d45", "#f4ba81", lambda d: truck_sprite(d, "#d65647", GOLD, True))


if __name__ == "__main__":
    main()
