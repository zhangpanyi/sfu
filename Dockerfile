FROM ubuntu:18.04

COPY docker/sources.list /etc/apt/sources.list

RUN apt-get update -y
RUN apt-get install -y \
    curl \
    wget \
    libxmlrpc-c++8-dev \
    libgsm1-dev \
    libspeex-dev \
    libopus-dev \
    libavresample-dev \
    libx264-dev \
    libvpx-dev \
    libswscale-dev \
    libavformat-dev \
    libmp4v2-dev \
    libgcrypt11-dev \
    libssl1.0-dev

RUN apt-get install -y npm \
    && npm install -g n \
    && n 8

RUN apt-get autoclean \
    apt-get clean \
    apt-get autoremove

COPY lib /sfu/lib
COPY www /sfu/www
COPY index.js /sfu/index.js
COPY package.json /sfu/package.json
COPY package-lock.json /sfu/package-lock.json

RUN cd /sfu && npm i

WORKDIR /sfu