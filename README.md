
<div align="center">
  <h1>✨ ShortYou</h1>
  <a href="https://github.com/HeiTang/ShortYou/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/HeiTang/ShortYou?color=orange" alt="License">
  </a>
  <a href="https://github.com/HeiTang/ShortYou/releases">
    <img src="https://img.shields.io/github/v/release/HeiTang/ShortYou?color=brightgreen" alt="Release">
  </a>
  <a href="https://github.com/HeiTang/ShortYou">
    <img src="https://img.shields.io/github/stars/HeiTang/ShortYou?color=ff69b4" alt="GitHub stars">
  </a>
  <br><br>
  <img src="https://readme-typing-svg.herokuapp.com?font=Changa&color=00F71A&size=30&center=true&vCenter=true&height=60&lines=Too+Long%3F+Shorten+it!;Too+Height%3F++Shorten+it!;Too+Fat%3F++Shorten+it!;30cm%3F++Shorten+it!">
  <img src="./docs/demo/page.png" alt="ShortYou homepage preview">
  <p>- - -</p>
  <p><i>“ ShortYou is a lightweight URL Shortener. ”</i></p>
  <p>ShortYou can shorten the lengthy URL and easy to share link with other people.</p>
</div>

<p align="center">
  English | <a href="./README.zh-TW.md">繁體中文</a>
</p>

## Overview

ShortYou is a lightweight URL shortener with a simple public-facing experience and a controlled link creation flow.

- Public visitors can open existing short links directly.

- Invited users can create new short links through a dedicated entry link.

- Maintainers can self-host the frontend and backend separately.

## Features

- ⭐️ Lightweight and self-hostable

- ⚙️ Custom aliases when needed

- 🔒 Controlled create flow for invited users

- 🖥️ Split frontend and backend deployment

## Quick Start

1. Visit [https://t.purr.tw/](https://t.purr.tw/) to open the homepage.

2. Existing short links look like `https://t.purr.tw/#your-alias`.

3. If you receive an invite link, open it to enter create mode.

4. The public playground is for demo only and does not create real short links.

## Self-Hosting

ShortYou uses a simple split setup that is friendly to small personal deployments.

- Frontend: GitHub Pages

- Backend: Google Apps Script

- Storage: Google Sheets

For setup steps and operational details, start with the maintainer documentation.

## Documentation

- [docs/maintainer-guide.zh-TW.md](docs/maintainer-guide.zh-TW.md) - Maintainer guide and self-hosting entry point (Traditional Chinese).
- [docs/backend-spec.zh-TW.md](docs/backend-spec.zh-TW.md) - Backend specification for maintainers (Traditional Chinese).

## Contributing

Issues and pull requests are welcome.

If you update documentation, keep the root README user-facing and move operational details into the docs directory.

## License

This project is licensed under the [MIT License](LICENSE).
