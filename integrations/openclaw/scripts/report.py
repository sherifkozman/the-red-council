#!/usr/bin/env python3
"""
Red Council Report Generator for OpenClaw

Generates security reports from scan results.
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

REPORT_DIR = Path.home() / ".red-council" / "reports"


def get_latest_scan() -> Path | None:
    """Get the most recent scan file."""
    if not REPORT_DIR.exists():
        return None

    scan_files = list(REPORT_DIR.glob("scan_*.json"))
    if not scan_files:
        return None

    return max(scan_files, key=lambda p: p.stat().st_mtime)


def load_scan(filepath: Path) -> dict:
    """Load scan results from file."""
    with open(filepath) as f:
        return json.load(f)


def generate_markdown_report(scan: dict, output_path: Path | None = None) -> str:
    """Generate a markdown security report."""
    lines = []

    # Header
    lines.append("# Red Council Security Report")
    lines.append("")
    lines.append(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if scan.get("start_time"):
        lines.append(f"**Scan Time:** {scan['start_time']}")
    lines.append("")

    # Executive Summary
    lines.append("## Executive Summary")
    lines.append("")

    risk_score = scan.get("risk_score", 0)
    if risk_score >= 7:
        risk_level = "CRITICAL"
    elif risk_score >= 5:
        risk_level = "HIGH"
    elif risk_score >= 3:
        risk_level = "MEDIUM"
    elif risk_score > 0:
        risk_level = "LOW"
    else:
        risk_level = "NONE"

    lines.append(f"**Overall Risk Score:** {risk_score}/10 ({risk_level})")
    lines.append("")

    vulnerabilities = scan.get("vulnerabilities", [])
    attacks = scan.get("attacks", [])

    lines.append(f"- **Attack Rounds:** {scan.get('rounds', len(attacks))}")
    lines.append(f"- **Vulnerabilities Found:** {len(vulnerabilities)}")
    successful = sum(1 for a in attacks if a.get("success"))
    lines.append(f"- **Successful Attacks:** {successful}/{len(attacks)}")
    lines.append("")

    # Vulnerabilities
    if vulnerabilities:
        lines.append("## Vulnerabilities Detected")
        lines.append("")

        # Sort by severity
        sorted_vulns = sorted(
            vulnerabilities,
            key=lambda x: x.get("severity", 0),
            reverse=True,
        )

        for i, vuln in enumerate(sorted_vulns, 1):
            severity = vuln.get("severity", 0)
            sev_label = (
                "CRITICAL"
                if severity >= 9
                else "HIGH"
                if severity >= 7
                else "MEDIUM"
                if severity >= 5
                else "LOW"
            )

            lines.append(f"### {i}. {vuln.get('category', 'Unknown')} ({sev_label})")
            lines.append("")
            lines.append(f"**Severity:** {severity}/10")
            lines.append("")
            lines.append(f"**Evidence:** {vuln.get('evidence', 'N/A')}")
            lines.append("")

            # Add OWASP reference
            category = vuln.get("category", "").lower()
            owasp_refs = {
                "prompt_injection": "ASI04 - Indirect Prompt Injection",
                "tool_abuse": "ASI02 - Inadequate Human Oversight",
                "data_disclosure": "ASI06 - Data Disclosure",
                "memory_poisoning": "ASI07 - Insecure Long-Term Memory",
                "goal_hijacking": "ASI08 - Goal and Instruction Misalignment",
                "excessive_agency": "ASI01 - Excessive Agency",
            }
            if category in owasp_refs:
                lines.append(f"**OWASP Reference:** {owasp_refs[category]}")
                lines.append("")

        lines.append("")

    # Attack Details
    if attacks:
        lines.append("## Attack Details")
        lines.append("")
        lines.append("| Round | Category | Result | Severity |")
        lines.append("|-------|----------|--------|----------|")

        for attack in attacks:
            result = "VULNERABLE" if attack.get("success") else "SAFE"
            severity = attack.get("severity", 0)
            lines.append(
                f"| {attack.get('round', '-')} | "
                f"{attack.get('category', '-')} | "
                f"{result} | "
                f"{severity}/10 |"
            )

        lines.append("")

    # Recommendations
    lines.append("## Recommendations")
    lines.append("")

    if vulnerabilities:
        # Generate recommendations based on vulnerabilities
        recommendations = set()

        for vuln in vulnerabilities:
            category = vuln.get("category", "").lower()

            if "prompt_injection" in category:
                recommendations.add(
                    "- **Sanitize External Content:** Treat all tool outputs "
                    "as untrusted. Use delimiters to separate instructions "
                    "from data."
                )
                recommendations.add(
                    "- **Input Validation:** Implement strict input validation "
                    "for all external data sources."
                )

            if "tool_abuse" in category:
                recommendations.add(
                    "- **Tool Allowlists:** Restrict which tools the agent "
                    "can access. Use `tools.exec.allowedBins` config."
                )
                recommendations.add(
                    "- **Rate Limiting:** Implement rate limits on "
                    "dangerous tools like `exec`."
                )

            if "data_disclosure" in category:
                recommendations.add(
                    "- **Secret Masking:** Never include secrets in agent "
                    "context. Use environment variables instead."
                )
                recommendations.add(
                    "- **Output Filtering:** Implement output filters to "
                    "detect and redact sensitive patterns."
                )

            if "memory_poisoning" in category:
                recommendations.add(
                    "- **Memory Isolation:** Use `scope: 'session'` to "
                    "isolate memory between sessions."
                )
                recommendations.add(
                    "- **Memory Validation:** Validate memory writes "
                    "against allowed key patterns."
                )

        for rec in sorted(recommendations):
            lines.append(rec)
    else:
        lines.append(
            "No critical vulnerabilities detected. Continue monitoring "
            "and run periodic security scans."
        )

    lines.append("")

    # Hardening Suggestions
    lines.append("## Hardening Configuration")
    lines.append("")
    lines.append("Add to `~/.openclaw/openclaw.json`:")
    lines.append("")
    lines.append("```json")
    lines.append(
        json.dumps(
            {
                "tools": {
                    "exec": {
                        "allowedBins": ["git", "ls", "cat"],
                        "deniedPatterns": ["rm -rf", "sudo", "chmod 777"],
                    }
                },
                "security": {
                    "dmScope": "per-channel-peer",
                    "requirePairingCode": True,
                    "allowedChannels": [],
                },
            },
            indent=2,
        )
    )
    lines.append("```")
    lines.append("")

    # Footer
    lines.append("---")
    lines.append("")
    lines.append(
        "*Report generated by [The Red Council]"
        "(https://theredcouncil.com) - "
        "AI Agent Security Testing*"
    )

    report = "\n".join(lines)

    if output_path:
        with open(output_path, "w") as f:
            f.write(report)
        print(f"Report saved: {output_path}")

    return report


def generate_json_report(scan: dict, output_path: Path | None = None) -> str:
    """Generate a JSON security report."""
    report = {
        "generated_at": datetime.now().isoformat(),
        "scan_time": scan.get("start_time"),
        "risk_score": scan.get("risk_score", 0),
        "summary": {
            "rounds": scan.get("rounds", 0),
            "vulnerabilities": len(scan.get("vulnerabilities", [])),
            "successful_attacks": sum(
                1 for a in scan.get("attacks", []) if a.get("success")
            ),
        },
        "vulnerabilities": scan.get("vulnerabilities", []),
        "attacks": scan.get("attacks", []),
    }

    json_str = json.dumps(report, indent=2)

    if output_path:
        with open(output_path, "w") as f:
            f.write(json_str)
        print(f"Report saved: {output_path}")

    return json_str


def generate_html_report(scan: dict, output_path: Path | None = None) -> str:
    """Generate an HTML security report."""
    risk_score = scan.get("risk_score", 0)
    vulnerabilities = scan.get("vulnerabilities", [])

    # Compute risk class for CSS
    if risk_score >= 7:
        risk_class = "critical"
    elif risk_score >= 5:
        risk_class = "high"
    elif risk_score >= 3:
        risk_class = "medium"
    elif risk_score > 0:
        risk_class = "low"
    else:
        risk_class = "none"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Red Council Security Report</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            max-width: 900px;
            margin: 0 auto;
            padding: 2rem;
            background: #0a0a0f;
            color: #fafafa;
        }}
        h1 {{ color: #dc2626; }}
        h2 {{ color: #3b82f6; border-bottom: 1px solid #333; padding-bottom: 0.5rem; }}
        .risk-score {{
            font-size: 3rem;
            font-weight: bold;
            text-align: center;
            padding: 2rem;
            border-radius: 8px;
            margin: 1rem 0;
        }}
        .risk-critical {{ background: #7f1d1d; }}
        .risk-high {{ background: #78350f; }}
        .risk-medium {{ background: #713f12; }}
        .risk-low {{ background: #1e3a5f; }}
        .risk-none {{ background: #14532d; }}
        .vuln {{
            background: #1a1a2e;
            border-left: 4px solid #dc2626;
            padding: 1rem;
            margin: 1rem 0;
            border-radius: 4px;
        }}
        .vuln-high {{ border-color: #f97316; }}
        .vuln-medium {{ border-color: #eab308; }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0;
        }}
        th, td {{
            padding: 0.75rem;
            text-align: left;
            border-bottom: 1px solid #333;
        }}
        th {{ background: #1a1a2e; }}
        code {{
            background: #1a1a2e;
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-family: monospace;
        }}
        pre {{
            background: #1a1a2e;
            padding: 1rem;
            border-radius: 8px;
            overflow-x: auto;
        }}
    </style>
</head>
<body>
    <h1>Red Council Security Report</h1>
    <p>Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</p>

    <div class="risk-score risk-{risk_class}">
        Risk Score: {risk_score}/10
    </div>

    <h2>Vulnerabilities ({len(vulnerabilities)})</h2>
"""

    if vulnerabilities:
        for vuln in sorted(
            vulnerabilities, key=lambda x: x.get("severity", 0), reverse=True
        ):
            severity = vuln.get("severity", 0)
            sev_class = (
                "" if severity >= 9 else "vuln-high" if severity >= 7 else "vuln-medium"
            )
            html += f"""
    <div class="vuln {sev_class}">
        <strong>{vuln.get("category", "Unknown")}</strong>
        (Severity: {severity}/10)<br>
        <em>{vuln.get("evidence", "N/A")}</em>
    </div>
"""
    else:
        html += "<p>No vulnerabilities detected.</p>"

    html += """
    <h2>Recommendations</h2>
    <ul>
        <li>Sanitize all external content before processing</li>
        <li>Implement tool allowlists and rate limiting</li>
        <li>Use session isolation for memory</li>
        <li>Run regular security scans</li>
    </ul>

    <hr>
    <p><em>Report by <a href="https://theredcouncil.com">The Red Council</a></em></p>
</body>
</html>
"""

    if output_path:
        with open(output_path, "w") as f:
            f.write(html)
        print(f"Report saved: {output_path}")

    return html


def main():
    parser = argparse.ArgumentParser(description="Red Council Report Generator")
    parser.add_argument(
        "input",
        nargs="?",
        help="Path to scan result JSON (defaults to latest)",
    )
    parser.add_argument(
        "--format",
        "-f",
        choices=["markdown", "json", "html"],
        default="markdown",
        help="Output format",
    )
    parser.add_argument(
        "--output",
        "-o",
        help="Output file path",
    )
    parser.add_argument(
        "--stdout",
        action="store_true",
        help="Print to stdout instead of file",
    )
    args = parser.parse_args()

    # Get scan file
    if args.input:
        scan_path = Path(args.input)
    else:
        scan_path = get_latest_scan()
        if not scan_path:
            print("No scan results found. Run '/red-council scan' first.")
            sys.exit(1)

    print(f"Loading scan: {scan_path}")
    scan = load_scan(scan_path)

    # Determine output path
    if args.output:
        output_path = Path(args.output)
    elif not args.stdout:
        ext = {"markdown": "md", "json": "json", "html": "html"}[args.format]
        output_path = REPORT_DIR / f"report_{scan_path.stem}.{ext}"
    else:
        output_path = None

    # Generate report
    if args.format == "markdown":
        report = generate_markdown_report(scan, output_path)
    elif args.format == "json":
        report = generate_json_report(scan, output_path)
    else:
        report = generate_html_report(scan, output_path)

    if args.stdout or not output_path:
        print(report)


if __name__ == "__main__":
    main()
