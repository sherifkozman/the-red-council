# Contributing to The Red Council

Thank you for your interest in contributing to The Red Council! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/the-red-council.git`
3. Create a feature branch: `git checkout -b feature/your-feature-name`
4. Set up the development environment (see README.md)

## Development Setup

```bash
# Backend
python -m venv venv
source venv/bin/activate
pip install -e ".[dev]"

# Frontend
cd frontend
pnpm install
```

## Code Standards

### Python
- Follow PEP 8 style guidelines
- Use type hints for all function signatures
- Write docstrings for public functions and classes
- Run `ruff check` before committing

### TypeScript/React
- Use TypeScript strict mode
- Follow the existing component patterns
- Use Tailwind CSS for styling

## Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=src

# Frontend tests
cd frontend && pnpm test
```

## Pull Request Process

1. Ensure all tests pass
2. Update documentation if needed
3. Add a clear PR description explaining the changes
4. Request review from maintainers

## Security

This project deals with LLM security testing. Please:
- Never commit API keys or credentials
- Report security vulnerabilities privately
- Follow responsible disclosure practices

## Questions?

Open an issue for questions or discussions about potential contributions.
