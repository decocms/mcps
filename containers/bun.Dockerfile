FROM oven/bun:1-alpine
# Add git to allow submodules to be cloned
RUN apk add --no-cache git
