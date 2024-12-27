FROM node:20-slim
RUN apt-get update && apt-get -y install dumb-init gcc g++ make libsqlite3-dev zlib1g-dev
WORKDIR /app
COPY package.json /app
COPY package-lock.json /app
COPY ./src /app/src
RUN npm ci
COPY ./submodule-deps /app/submodule-deps
WORKDIR /app/submodule-deps/tippecanoe
RUN make
RUN make install
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
