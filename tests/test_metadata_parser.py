from lib.metadata_parser import parse_description, SongMetadata


def test_label_format_all_fields():
    description = (
        "Singer: Arijit Singh\n"
        "Music: Pritam\n"
        "Lyrics: Amitabh Bhattacharya\n"
        "Film: Pathaan\n"
        "Language: Hindi\n"
        "Released on: 2023\n"
    )
    meta = parse_description(description)

    assert meta.singers == ["Arijit Singh"]
    assert meta.music_director == "Pritam"
    assert meta.lyricist == "Amitabh Bhattacharya"
    assert meta.film == "Pathaan"
    assert meta.language == "Hindi"
    assert meta.year == "2023"


def test_label_format_dash_separator():
    meta = parse_description("Singer - Shreya Ghoshal\nComposer - A.R. Rahman\n")
    assert meta.singers == ["Shreya Ghoshal"]
    assert meta.music_director == "A.R. Rahman"


def test_multi_singer_split_on_comma_ampersand_and():
    meta = parse_description("Singers: Arijit Singh, Neha Kakkar & Badshah and Jonita Gandhi")
    assert meta.singers == ["Arijit Singh", "Neha Kakkar", "Badshah", "Jonita Gandhi"]


def test_multi_artist_split_does_not_split_names_containing_and_substring():
    # "Andrea" contains "and" but not as a standalone word, must survive intact
    meta = parse_description("Singer: Andrea Jeremiah")
    assert meta.singers == ["Andrea Jeremiah"]


def test_music_director_variants():
    for line in ["Music: Ilaiyaraaja", "Music Director: Ilaiyaraaja", "Composer: Ilaiyaraaja", "Composed By: Ilaiyaraaja"]:
        meta = parse_description(line)
        assert meta.music_director == "Ilaiyaraaja", line


def test_lyricist_variants():
    for line in ["Lyrics: Gulzar", "Lyrics By: Gulzar", "Lyricist: Gulzar"]:
        meta = parse_description(line)
        assert meta.lyricist == "Gulzar", line


def test_film_variants():
    for line, field in [("Film: Jawan", "film"), ("Movie: Jawan", "film"), ("Album: Jawan", "film")]:
        meta = parse_description(line)
        assert getattr(meta, field) == "Jawan", line


def test_trailing_noise_stripped():
    meta = parse_description("Singer: Arijit Singh,\n")
    assert meta.singers == ["Arijit Singh"]


def test_topic_channel_format():
    description = "Composer: Pritam\nLyricist: Amitabh Bhattacharya\nArtist: Arijit Singh\n"
    meta = parse_description(description)
    assert meta.music_director == "Pritam"
    assert meta.lyricist == "Amitabh Bhattacharya"
    assert meta.singers == ["Arijit Singh"]


def test_topic_channel_dot_separated_artists():
    description = "Kesariya · Arijit Singh · Pritam\nSome other line\n"
    meta = parse_description(description)
    assert meta.singers == ["Arijit Singh", "Pritam"]


def test_dot_separator_only_checked_on_first_line_not_scanned_whole_description():
    # A "·" later in the description (e.g. channel branding) must not be
    # misread as an artist line when there's no explicit Singer: field and
    # the actual first line isn't in "Song · Artist" form.
    description = "Official Video\nSubscribe · Follow us on Instagram\n"
    meta = parse_description(description)
    assert meta.singers == []


def test_label_format_takes_priority_over_topic_format():
    # When label-style "Singer:" is present, the dot-separated fallback must not run
    description = "Title · Someone Else\nSinger: Arijit Singh\n"
    meta = parse_description(description)
    assert meta.singers == ["Arijit Singh"]


def test_year_extraction():
    meta = parse_description("Some description\nReleased on: 2019\n")
    assert meta.year == "2019"


def test_year_missing_when_absent():
    meta = parse_description("No release info here")
    assert meta.year == ""


def test_language_tag_fallback():
    meta = parse_description("no language line here", tags=["Bollywood", "Tamil", "song"])
    assert meta.language == "Tamil"


def test_language_label_takes_priority_over_tags():
    meta = parse_description("Language: Telugu", tags=["Hindi"])
    assert meta.language == "Telugu"


def test_empty_description_yields_empty_metadata():
    meta = parse_description("")
    assert meta == SongMetadata()
    assert meta.playlist_entries() == []


def test_playlist_entries_includes_decade_for_valid_year():
    meta = SongMetadata(year="1998")
    entries = meta.playlist_entries()
    assert ("Year", "1998") in entries
    assert ("Decade", "1990s") in entries


def test_playlist_entries_skips_decade_for_non_4digit_year():
    meta = SongMetadata(year="98")
    entries = meta.playlist_entries()
    assert not any(category == "Decade" for category, _ in entries)


def test_playlist_entries_multiple_singers_each_own_entry():
    meta = SongMetadata(singers=["A", "B"])
    entries = meta.playlist_entries()
    assert ("Singer", "A") in entries
    assert ("Singer", "B") in entries
