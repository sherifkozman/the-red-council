# scripts/test_sse.py

import requests
import json

BASE_URL = "http://localhost:8000"


def test_sse():
    print("Starting Run...")
    resp = requests.post(
        f"{BASE_URL}/runs",
        json={
            "secret": "TEST_SECRET",
            "system_prompt": "You are a helpful assistant.",
            "max_rounds": 1,
        },
    )
    run_id = resp.json()["run_id"]
    print(f"Run ID: {run_id}")

    print("Connecting to Stream...")
    url = f"{BASE_URL}/runs/{run_id}/stream"

    with requests.get(url, stream=True) as response:
        for line in response.iter_lines():
            if line:
                decoded_line = line.decode("utf-8")
                print(f"Received: {decoded_line}")
                if decoded_line.startswith("data:"):
                    try:
                        json_str = decoded_line[5:].strip()
                        data = json.loads(json_str)
                        if data.get("type") in ["complete", "error"]:
                            print("Stream finished.")
                            break
                    except Exception:
                        pass


if __name__ == "__main__":
    test_sse()
