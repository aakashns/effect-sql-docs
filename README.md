# Effect SQL Documentation

Documentation site for Effect SQL, built with VitePress.

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## Deployment to Cloudflare Pages

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

### Deploy

1. Build the site:

```bash
pnpm build
```

2. Deploy to Cloudflare Pages:

```bash
npx wrangler pages deploy .vitepress/dist
```

### CI/CD with GitHub Actions

For automatic deployments, add this workflow to `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install
      - run: pnpm build

      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy .vitepress/dist --project-name=effect-sql-docs
```

Required secrets:
- `CLOUDFLARE_API_TOKEN` - API token with Pages edit permissions
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

## License

MIT

