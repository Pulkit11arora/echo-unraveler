# Modal backend for Echo Unraveler

Serverless Demucs separation, deployed on Modal (scale-to-zero, no idle cost).

## Setup

```bash
pip install modal fastapi
modal setup          # authenticate, one-time
```

## Deploy

```bash
modal deploy separator.py
```

This prints a URL like:

```
https://<workspace>--echo-unraveler-separator-separate-endpoint.modal.run
```

Set that as `VITE_SEPARATE_ENDPOINT` in Netlify (and your local `.env`).

## Local test

```bash
modal serve separator.py
```

gives a temporary URL for testing before deploying.
