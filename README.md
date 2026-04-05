# MotoMate

[![License](https://img.shields.io/badge/license-AGPL%203.0-blue)](LICENSE)
[![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/hawkinslabdev/motomate/.github%2Fworkflows%2Fdocker.yml)](#)
[![Last commit](https://img.shields.io/github/last-commit/hawkinslabdev/motomate)](https://github.com/hawkinslabdev/motomate/commits/main)
[![Support](https://img.shields.io/badge/Support-Buy%20me%20a%20coffee-fdd734?logo=buy-me-a-coffee)](https://coff.ee/hawkinslabdev)

This is **MotoMate**. It is a self-hosted vehicle maintenance tracker, built with a focus on two-wheeled riders and garage-ready simplicity. All your service history stays local. MotoMate offers full transparency of the source code so you can run it yourself, own your data, and completely trust the system keeping your records.

<img width="100%" alt="MotoMate screenshot" src="https://github.com/hawkinslabdev/motomate/blob/main/.github/images/example.webp" />

We want to make it incredibly simple for riders and vehicle enthusiasts to host their own maintenance journals. Unlike more complex systems such as [LubeLogger](https://lubelogger.com/?ref=github.com/hawkinslabdev/motomate), MotoMate is designed to strip your tracking down to the absolute essentials. 

Whether you are logging routine oil changes, monitoring tire wear, recording valve clearances, or preparing for your next regional inspection, the process remains clean, easy to understand, and effortless to maintain.

### Key Highlights

* **Lightweight Tracking:** <br> Focuses on the maintenance essentials, built to handle regional inspection intervals.
* **Mobile-First Interface:** <br> Designed for use on a phone or tablet while you are actually in the garage.
* **Privacy by Design:** <br> Self-hosted and local-first. Your service history never leaves your hardware.

In short: A modern, minimal maintenance tracking application for you, but built to ensure you spend less time logging and more time riding.

## Getting Started

The easiest way to get MotoMate running locally is with Docker Compose:

```yaml
services:
  motomate:
    image: ghcr.io/hawkinslabdev/motomate:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
      - ./uploads:/app/uploads
    environment:
      - PUBLIC_APP_URL=http://localhost:3000
      - PUBLIC_APP_ORIGINS=http://localhost
      - AUTH_COOKIE_SECURE=false
      - AUTH_SECRET=change-me-in-production-min-32-chars
      - STORAGE_ADAPTER=local
    restart: unless-stopped
```

Download the image and start the container, and you're ready to start. From there, you can see if it fits with how you want to keep your records in the garage.

## Donate

[![Buy Me A Coffee](https://img.shields.io/badge/Buy_me_a_coffee-fdd734?\&logo=buy-me-a-coffee\&logoColor=black\&style=for-the-badge)](https://coff.ee/hawkinslabdev)
[![GitHub Sponsors](https://img.shields.io/badge/GitHub_Sponsors-30363d?style=for-the-badge\&logo=github\&logoColor=white)](https://github.com/sponsors/hawkinslabdev)

If this saves you time, stress, or a spreadsheet, feel free to buy me a coffee or sponsor the project. It helps keep the coffee fresh.

## License

This project is licensed under the **AGPL 3.0** license. See [LICENSE](LICENSE) for details.

## Contributing

This is meant to be a community-driven project. Ideas, bug reports, and pull requests are all welcome. If something feels off or could be better, open an issue and let's talk about it.