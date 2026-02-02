"""Red Council CLI entry point.

Provides command-line interface for The Red Council LLM security testing platform.
"""

import argparse
import sys
from pathlib import Path


def main() -> int:
    """Main CLI entry point for red-council command."""
    parser = argparse.ArgumentParser(
        prog="red-council",
        description="The Red Council - LLM Adversarial Security Arena",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  red-council dashboard          Start the Streamlit dashboard
  red-council api                Start the FastAPI server
  red-council test               Run the test suite
  red-council version            Show version information

For more information, visit: https://github.com/anthropics/red-council
        """,
    )

    parser.add_argument(
        "command",
        nargs="?",
        choices=["dashboard", "api", "test", "version"],
        default="dashboard",
        help="Command to run (default: dashboard)",
    )

    parser.add_argument(
        "--host",
        default="0.0.0.0",  # noqa: S104 - CLI intentionally binds to all interfaces
        help="Host to bind to (default: 0.0.0.0)",
    )

    parser.add_argument(
        "--port",
        type=int,
        default=8501,
        help="Port to bind to (default: 8501 for dashboard, 8000 for API)",
    )

    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Enable verbose output",
    )

    args = parser.parse_args()

    if args.command == "version":
        try:
            from importlib.metadata import version

            ver = version("the-red-council")
        except Exception:
            ver = "0.5.0"
        print(f"The Red Council v{ver}")
        return 0

    if args.command == "dashboard":
        import subprocess

        dashboard_path = Path(__file__).parent / "ui" / "dashboard.py"
        cmd = [
            sys.executable,
            "-m",
            "streamlit",
            "run",
            str(dashboard_path),
            "--server.port",
            str(args.port),
            "--server.address",
            args.host,
        ]
        if args.verbose:
            print(f"Starting dashboard: {' '.join(cmd)}")
        return subprocess.call(cmd)  # noqa: S603 - trusted cmd from hardcoded values

    if args.command == "api":
        import uvicorn

        port = args.port if args.port != 8501 else 8000
        if args.verbose:
            print(f"Starting API server on {args.host}:{port}")
        uvicorn.run(
            "src.api.main:app",
            host=args.host,
            port=port,
            reload=args.verbose,
        )
        return 0

    if args.command == "test":
        import subprocess

        cmd = [sys.executable, "-m", "pytest", "tests/", "-v"]
        if args.verbose:
            print(f"Running tests: {' '.join(cmd)}")
        return subprocess.call(cmd)  # noqa: S603 - trusted cmd from hardcoded values

    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
