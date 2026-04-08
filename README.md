# MotoMate

[![License](https://img.shields.io/badge/license-AGPL%203.0-blue)](LICENSE)
[![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/hawkinslabdev/motomate/.github%2Fworkflows%2Fbuild-container.yml)](#)
[![Support](https://img.shields.io/badge/Support-Buy%20me%20a%20coffee-fdd734?logo=buy-me-a-coffee)](https://coff.ee/hawkinslabdev)

MotoMate is a self-hosted maintenance tracker for vehicles. Manage your own maintenance journals easily, in a web interface available from your (mobile) device. You can log custom maintenance tasks directly from the garage. All service history and data remain strictly on your own hardware.

<img width="100%" alt="MotoMate screenshot" src="https://github.com/hawkinslabdev/motomate/blob/main/.github/images/example.webp" />

We want to make it incredibly simple for riders and vehicle enthusiasts to host their own maintenance journals. Unlike more complex systems such as [LubeLogger](https://lubelogger.com/?ref=github.com/hawkinslabdev/motomate), MotoMate is designed to strip your tracking down to the absolute essentials. 

## Getting Started

You can run MotoMate locally using Docker Compose:

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
      - TZ=Europe/Amsterdam
      - PUBLIC_APP_URL=http://localhost:3000
      - PUBLIC_APP_ORIGINS=http://localhost
      - AUTH_COOKIE_SECURE=false
      - AUTH_SECRET=change-me-in-production-min-32-chars
      - STORAGE_ADAPTER=local
      - BODY_SIZE_LIMIT=20971520
    restart: unless-stopped
```

After downloading the image and starting the container, the application will be available after a few seconds.

## Donate

[![Buy Me A Coffee](https://img.shields.io/badge/Buy_me_a_coffee-fdd734?\&logo=buy-me-a-coffee\&logoColor=black\&style=for-the-badge)](https://coff.ee/hawkinslabdev)
[![GitHub Sponsors](https://img.shields.io/badge/GitHub_Sponsors-30363d?style=for-the-badge\&logo=github\&logoColor=white)](https://github.com/sponsors/hawkinslabdev)

If MotoMate replaces your existing spreadsheet or saves you time, you can support the project through GitHub Sponsors or Buy Me A Coffee.

## License

This project is licensed under the **AGPL 3.0** license. See [LICENSE](https://www.google.com/search?q=LICENSE) for details.

## Contributing

Contributions including ideas, bug reports, and pull requests are welcome. Please open an issue to discuss any proposed changes or identified issues.
