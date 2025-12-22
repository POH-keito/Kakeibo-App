# E2E Tests

Playwright E2E tests for Kakeibo-App.

## Directory Structure

```
tests/
├── e2e/              # E2E test files
│   └── smoke.spec.ts # Basic smoke tests (Phase 1)
├── fixtures/         # Test data and fixtures
│   └── sample.csv    # Sample CSV for import tests
└── README.md         # This file
```

## Running Tests

```bash
# Run all tests
npm run test:e2e

# Run with UI mode (interactive)
npm run test:e2e:ui

# Generate test code with Codegen
npm run test:codegen
```

## Test Strategy

See [TEST_STRATEGY.md](../.docs/TEST_STRATEGY.md) for detailed testing approach and phase-by-phase test plans.

## Phase 1: Basic Smoke Tests

The current `smoke.spec.ts` includes:
- Application startup verification
- Basic navigation verification

## Next Steps

Following phases will add:
- Phase 2: Authentication and role-based access tests
- Phase 3: Dashboard feature tests
- Phase 4: Utilities feature tests

See TEST_STRATEGY.md for complete test specifications.
