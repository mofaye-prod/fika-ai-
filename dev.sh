#!/usr/bin/env bash
trap 'kill 0' EXIT
(cd pipecat-quickstart/server && uv run bot.py) &
(cd language-agent-ui && npm run dev) &
wait
