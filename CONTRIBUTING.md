# Contributing to VoxTube

Thanks for your interest in contributing to VoxTube! This document provides guidelines and information for contributors.

## Getting Started

1. **Fork the repository** and clone it locally
2. **Install dependencies** with `bun install`
3. **Set up prerequisites** (see README.md)
4. **Run the dev server** with `bun run dev`

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/voxtube.git
cd voxtube

# Install dependencies
bun install

# Copy environment config
cp .env.example .env

# Start Kokoro TTS (required for audio generation)
docker run -p 8880:8880 ghcr.io/remsky/kokoro-fastapi:latest

# Run development server
bun run dev
```

## Project Structure

```
voxtube/
├── src/
│   ├── index.ts       # Server entry point
│   ├── routes/        # API route handlers
│   ├── services/      # Business logic (TTS, transcripts, cache)
│   └── types/         # TypeScript types
├── public/            # Static frontend files
├── cache/             # Generated audio cache (gitignored)
└── tests/             # Test files
```

## Making Changes

### Code Style

- We use TypeScript for type safety
- Follow existing code patterns
- Keep functions small and focused
- Add types for all function parameters and returns

### Testing

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run specific test file
bun test src/services/cache.test.ts
```

### Commit Messages

Use clear, descriptive commit messages:

```
feat: Add voice preview functionality
fix: Handle missing transcript gracefully
docs: Update API endpoint documentation
refactor: Extract audio processing to service
```

Prefix format:
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `refactor:` Code changes that don't add features or fix bugs
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

## Pull Request Process

1. **Create a branch** for your changes
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** and commit them

3. **Test your changes** thoroughly
   ```bash
   bun test
   bun run dev  # Manual testing
   ```

4. **Push to your fork** and open a PR

5. **Describe your changes** in the PR description:
   - What does this PR do?
   - Why is this change needed?
   - How can reviewers test it?

## Feature Requests & Bug Reports

- **Bug reports**: Open an issue with steps to reproduce
- **Feature requests**: Open an issue describing the use case
- **Questions**: Open a discussion or issue

## Areas for Contribution

Looking for something to work on? Here are some ideas:

- **Voice previews**: Preview a voice before generating full audio
- **Progress indicators**: Show TTS generation progress
- **Playlist support**: Generate audio for multiple videos
- **Download queue**: Batch download management
- **Mobile UI improvements**: Better responsive design
- **Speed controls**: Playback speed adjustment
- **Chapter markers**: Jump to sections in long videos

## Code of Conduct

Be respectful and constructive. We're all here to build something useful.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
