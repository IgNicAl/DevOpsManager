import json
import logging
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)

_OUI_FILE = Path(__file__).resolve().parent.parent / "data" / "oui_prefixes.json"


@lru_cache(maxsize=1)
def _load_oui_db() -> dict[str, str]:
    try:
        return json.loads(_OUI_FILE.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Failed to load OUI database: %s", exc)
        return {}


def lookup_vendor(mac: str) -> str:
    """Resolve MAC address to vendor name via local OUI database.

    Accepts formats: AA:BB:CC:DD:EE:FF, AA-BB-CC-DD-EE-FF, AABBCCDDEEFF
    Returns vendor name or "Unknown".
    """
    if not mac:
        return "Unknown"
    clean = mac.upper().replace(":", "").replace("-", "").replace(".", "")
    if len(clean) < 6:
        return "Unknown"
    prefix = clean[:6]
    db = _load_oui_db()
    return db.get(prefix, "Unknown")
