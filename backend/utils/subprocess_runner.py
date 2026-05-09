import subprocess
import logging

logger = logging.getLogger(__name__)


def run_cmd(args: list[str], timeout: int = 30) -> tuple[bool, str]:
    """Run a subprocess command safely.

    Args:
        args: Command as a list of strings (never use shell=True).
        timeout: Max seconds to wait.

    Returns:
        Tuple of (success: bool, output: str).
        On failure, output contains stderr or exception message.
    """
    try:
        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
        )
        if result.returncode == 0:
            return True, result.stdout.strip()
        return False, result.stderr.strip() or f"Command exited with code {result.returncode}"
    except FileNotFoundError:
        cmd_name = args[0] if args else "unknown"
        return False, f"{cmd_name} is not installed or not in PATH"
    except subprocess.TimeoutExpired:
        return False, f"Command timed out after {timeout}s"
    except Exception as exc:
        logger.exception("Unexpected error running command")
        return False, str(exc)
