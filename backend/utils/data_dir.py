import os
from pathlib import Path

_DEFAULT = Path(__file__).resolve().parent.parent / "data"


def get_data_dir() -> Path:
    raw = os.environ.get("BACKEND_DATA_DIR")
    path = Path(raw).expanduser() if raw else _DEFAULT
    path.mkdir(parents=True, exist_ok=True)
    return path


def data_path(name: str) -> Path:
    return get_data_dir() / name
