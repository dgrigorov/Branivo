"""pytest configuration for branivo-ocr end-to-end tests.

CLI options
-----------
--api-url   Base URL of the running OCR service (default: http://localhost:8888)

Usage examples
--------------
  pytest tests/                            # run against local Docker
  pytest tests/ --api-url http://staging:8888
  pytest tests/ -v                         # verbose: show each field result
  pytest tests/ -k doc-001                 # single document
"""

import pytest


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--api-url",
        default="http://localhost:8888",
        help="Base URL of the branivo-ocr service (default: http://localhost:8888)",
    )


@pytest.fixture(scope="session")
def api_url(request: pytest.FixtureRequest) -> str:
    return request.config.getoption("--api-url").rstrip("/")
