import re
from dataclasses import dataclass, field


@dataclass
class SongMetadata:
    title: str = ""
    singers: list[str] = field(default_factory=list)
    music_director: str = ""
    lyricist: str = ""
    film: str = ""
    language: str = ""
    year: str = ""

    def playlist_entries(self) -> list[tuple[str, str]]:
        """Return (category_prefix, value) pairs for non-empty fields."""
        entries = []
        for singer in self.singers:
            entries.append(("Singer", singer))
        if self.music_director:
            entries.append(("Music", self.music_director))
        if self.lyricist:
            entries.append(("Lyrics", self.lyricist))
        if self.film:
            entries.append(("Film", self.film))
        if self.language:
            entries.append(("Language", self.language))
        return entries


# Label channel description patterns (T-Series, Sony Music South, Zee Music, etc.)
_LABEL_PATTERNS: list[tuple[str, str]] = [
    ("singers", r"(?:Singer|Vocals?|Sung By)\s*[:\-]\s*(.+)"),
    ("music_director", r"(?:Music(?:\s+Director)?|Composer|Composed By)\s*[:\-]\s*(.+)"),
    ("lyricist", r"(?:Lyrics?(?:\s+By)?|Lyricist)\s*[:\-]\s*(.+)"),
    ("film", r"(?:Film|Movie|Album)\s*[:\-]\s*(.+)"),
    ("language", r"(?:Language)\s*[:\-]\s*(.+)"),
]

# YouTube auto-generated Topic channel patterns
_TOPIC_PATTERNS: list[tuple[str, str]] = [
    ("music_director", r"^Composer\s*:\s*(.+)$"),
    ("lyricist", r"^Lyricist\s*:\s*(.+)$"),
    ("singers", r"^Artist\s*:\s*(.+)$"),
]

_NOISE = re.compile(r"\s*[,;]\s*$")
_MULTI_ARTIST = re.compile(r"\s*[,&]\s*|\s+and\s+", re.IGNORECASE)


def _clean(value: str) -> str:
    return _NOISE.sub("", value).strip()


def _split_artists(value: str) -> list[str]:
    parts = _MULTI_ARTIST.split(value)
    return [_clean(p) for p in parts if _clean(p)]


def parse_description(description: str, tags: list[str] | None = None) -> SongMetadata:
    meta = SongMetadata()
    lines = description.splitlines()

    # Try label format first (line-by-line key:value)
    for line in lines:
        for field_name, pattern in _LABEL_PATTERNS:
            m = re.match(pattern, line.strip(), re.IGNORECASE)
            if m:
                val = _clean(m.group(1))
                if field_name == "singers":
                    meta.singers = _split_artists(val)
                elif not getattr(meta, field_name):
                    setattr(meta, field_name, val)

    # Try Topic channel format (multiline block)
    if not meta.music_director and not meta.singers:
        for line in lines:
            for field_name, pattern in _TOPIC_PATTERNS:
                m = re.match(pattern, line.strip(), re.IGNORECASE)
                if m:
                    val = _clean(m.group(1))
                    if field_name == "singers":
                        meta.singers = _split_artists(val)
                    elif not getattr(meta, field_name):
                        setattr(meta, field_name, val)

        # Topic format: "Song · Artist1 · Artist2" on first non-empty line
        for line in lines:
            stripped = line.strip()
            if "·" in stripped and not meta.singers:
                parts = [p.strip() for p in stripped.split("·")]
                if len(parts) >= 2:
                    meta.singers = [_clean(p) for p in parts[1:] if _clean(p)]
                break

    # Year from description
    if not meta.year:
        m = re.search(r"Released on:\s*(\d{4})", description)
        if m:
            meta.year = m.group(1)

    # Tags fallback for language
    if not meta.language and tags:
        lang_keywords = {
            "hindi", "tamil", "telugu", "kannada", "malayalam",
            "bengali", "marathi", "punjabi", "gujarati", "odia",
        }
        for tag in tags:
            if tag.lower() in lang_keywords:
                meta.language = tag.capitalize()
                break

    return meta
