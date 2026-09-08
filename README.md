# MotoMate

[![License](https://img.shields.io/badge/license-AGPL%203.0-blue)](LICENSE)
[![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/hawkinslabdev/motomate/.github%2Fworkflows%2Fbuild-container.yml)](#)
[![GitHub Tag](https://img.shields.io/github/v/tag/hawkinslabdev/motomate?label=version)](#)
[![Support](https://img.shields.io/badge/Support-Buy%20me%20a%20coffee-fdd734?logo=buy-me-a-coffee)](https://coff.ee/hawkinslabdev)

Take control of your **vehicle maintenance** with MotoMate, a self-hosted (maintenance) tracking web application. Access your digital maintenance journal from any mobile device to log tasks right from the garage. Because it is self-hosted, your data and service history never leave your own hardware.

View our [**demo-instance here**](https://motomate.mijnmotorparkeren.nl) (hosted by MijnMotorParkeren.nl). Want to try it yourself? Then set-up your own instance using the instructions below.

> [!WARNING]
> **We need your help!** MotoMate is still under _active_ development and you may encounter bugs. Please help improve the project by reporting issues, suggesting missing features, or, preferably, submitting a pull request.

<img width="100%" alt="MotoMate screenshot" src=".github/images/example.webp" />

We want to make it incredibly simple for riders and vehicle enthusiasts to host their own maintenance journals. Unlike more complex systems such as [LubeLogger](https://lubelogger.com/?ref=github.com/hawkinslabdev/motomate), MotoMate is designed to strip your tracking down to the absolute essentials. 

## Getting Started

You can run MotoMate locally using Docker Compose:

```sh
# You need to generate a random AUTH_SECRET first:
echo "AUTH_SECRET=$(openssl rand -hex 32)" > .env
```

Then save the following contents into your `docker-compose.yml` file:

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
      - AUTH_SECRET=${AUTH_SECRET}
      - AUTH_ALLOW_REGISTRATION=false
      - AUTH_COOKIE_SECURE=false
    restart: unless-stopped
```

After downloading the image and starting the container, the application will be ready in a few seconds once database migrations complete. 

Looking for a complete list of environment variables? See the [docker-compose.yml](docker-compose.yml) and [.env.example](motomate/.env.example) example files.

## Integrations

MotoMate exposes a complete OpenAPI interface for custom API integrations. It supports configurable notification handlers for alerts, OIDC authentication, and it connects directly with S3-compatible object storage and [Paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) for automated document backups.

## Donate

[![Buy Me A Coffee](https://img.shields.io/badge/Buy_me_a_coffee-fdd734?\&logo=buy-me-a-coffee\&logoColor=black\&style=for-the-badge)](https://coff.ee/hawkinslabdev)
[![GitHub Sponsors](https://img.shields.io/badge/GitHub_Sponsors-30363d?style=for-the-badge\&logo=github\&logoColor=white)](https://github.com/sponsors/hawkinslabdev)

Want to support MotoMate? Drop a star on GitHub, or consider supporting development via GitHub Sponsors or Buy Me a Coffee.

## License

This project is licensed under the **AGPL 3.0** license. See [LICENSE](LICENSE) for details.

## Contributors

Made possible thanks to the following people:

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/hawkinslabdev"><img src="https://avatars.githubusercontent.com/u/59891413?v=4?s=100" width="100px;" alt="Dan"/><br /><sub><b>Dan</b></sub></a><br /><a href="https://github.com/hawkinslabdev/motomate/commits?author=hawkinslabdev" title="Code">💻</a> <a href="#ideas-hawkinslabdev" title="Ideas, Planning, & Feedback">🤔</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://www.varrieur.dev/"><img src="https://avatars.githubusercontent.com/u/1863155?v=4?s=100" width="100px;" alt="Michael Varrieur"/><br /><sub><b>Michael Varrieur</b></sub></a><br /><a href="https://github.com/hawkinslabdev/motomate/commits?author=mvarrieur" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/gg64nou"><img src="https://avatars.githubusercontent.com/u/3111206?v=4?s=100" width="100px;" alt="Ovidiu"/><br /><sub><b>Ovidiu</b></sub></a><br /><a href="#translation-gg64nou" title="Translation">🌍</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://ovidiu.nl"><img src="https://avatars.githubusercontent.com/u/63847?v=4?s=100" width="100px;" alt="Ovidiu Curcan"/><br /><sub><b>Ovidiu Curcan</b></sub></a><br /><a href="https://github.com/hawkinslabdev/motomate/commits?author=Ovidiu" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/brdweb"><img src="https://avatars.githubusercontent.com/u/58915?v=4?s=100" width="100px;" alt="Jason Mitchell"/><br /><sub><b>Jason Mitchell</b></sub></a><br /><a href="https://github.com/hawkinslabdev/motomate/commits?author=brdweb" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/NJBodey"><img src="https://avatars.githubusercontent.com/u/135049486?v=4?s=100" width="100px;" alt="NJBodey"/><br /><sub><b>NJBodey</b></sub></a><br /><a href="https://github.com/hawkinslabdev/motomate/commits?author=NJBodey" title="Code">💻</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

Contributions including ideas, bug reports, and pull requests are welcome. Please open an issue to discuss any proposed changes or identified issues.
