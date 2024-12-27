FROM node:20-slim
RUN apt-get update && apt-get -y install dumb-init gcc g++ make libsqlite3-dev zlib1g-dev
WORKDIR /app/submodule-deps/tippecanoe
RUN ls -l
RUN make
RUN make install
WORKDIR /app
COPY package.json /app
COPY package-lock.json /app
COPY ./src /app/src
RUN npm ci
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
