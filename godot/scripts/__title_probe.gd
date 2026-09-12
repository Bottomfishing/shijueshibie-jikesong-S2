extends SceneTree

func _init() -> void:
	var card = load("res://scripts/title_card.gd").new()
	card.name = "TitleProbe"
	root.add_child(card)
	await process_frame

	print("=== build ===")
	print("layer (expect 100): ", card.layer)
	print("glyph groups (expect 4): ", card._chars.size())
	print("each glyph has 3 layers (RGB split): ", card._chars[0].size() >= 5)
	print("backdrop built: ", card._backdrop != null)
	print("meta text: ", card._meta.text)
	print("rule starts collapsed (expect 0.0): ", card._rule.size.x)
	print("")

	print("=== timeline ===")
	var seen: Array[String] = []
	var reveal_log: Array[String] = []
	var last := ""
	var last_revealed := -1
	var guard := 0
	while not card.is_finished() and guard < 2000:
		card._process(1.0 / 60.0)
		var t := guard / 60.0
		if card.stage != last:
			seen.append("%.2fs -> %s" % [t, card.stage])
			last = card.stage
		if card._revealed != last_revealed:
			last_revealed = card._revealed
			reveal_log.append("%.2fs  %d/%d chars lit" % [t, card._revealed, card.TITLE.length()])
		guard += 1

	for row in seen:
		print("   ", row)
	print("")
	print("=== per-glyph reveal ===")
	for row in reveal_log:
		print("   ", row)
	print("")
	print("total duration: %.2fs" % (guard / 60.0))
	print("finished: ", card.is_finished())
	print("hidden after done (expect false visible): ", card.visible)
	print("all 4 glyphs lit: ", card._revealed == card.TITLE.length())
	print("")

	print("=== skip path ===")
	var card2 = load("res://scripts/title_card.gd").new()
	card2.name = "TitleProbe2"
	root.add_child(card2)
	await process_frame
	card2._process(0.3)
	print("stage before skip: ", card2.stage)
	card2.skip()
	print("stage after skip (expect fade): ", card2.stage)
	var g2 := 0
	while not card2.is_finished() and g2 < 500:
		card2._process(1.0 / 60.0)
		g2 += 1
	print("skip reaches done: ", card2.is_finished())
	print("skip total: %.2fs" % (g2 / 60.0))

	card.queue_free()
	card2.queue_free()
	quit(0)
