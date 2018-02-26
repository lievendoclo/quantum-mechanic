FROM centos/nodejs-8-centos7

LABEL subatomic-version="2.0"

# Atomist
ENV DUMB_INIT_VERSION=1.2.1

USER root

## Install dumb-init
RUN wget -O /usr/local/bin/dumb-init https://github.com/Yelp/dumb-init/releases/download/v$DUMB_INIT_VERSION/dumb-init_${DUMB_INIT_VERSION}_amd64

RUN chmod +x /usr/local/bin/dumb-init

RUN mkdir -p /opt/app

WORKDIR /opt/app

COPY . .

## Need to add node and npm to the path
ENV PATH="/opt/rh/rh-nodejs8/root/usr/bin:${PATH}"

ENV NPM_CONFIG_LOGLEVEL warn

RUN npm install

ENV SUPPRESS_NO_CONFIG_WARNING true

EXPOSE 2866

# OC Client Tools
ENV OC_VERSION "v3.7.1"
ENV OC_RELEASE "openshift-origin-client-tools-v3.7.1-ab0f056-linux-64bit"

ADD https://github.com/openshift/origin/releases/download/$OC_VERSION/$OC_RELEASE.tar.gz /opt/oc/release.tar.gz

RUN tar --strip-components=1 -xzvf  /opt/oc/release.tar.gz -C /opt/oc/ && \
    mv /opt/oc/oc /usr/bin/ && \
    rm -rf /opt/oc

USER 1001

ENTRYPOINT ["dumb-init", "node", "--trace-warnings", "--expose_gc", "--optimize_for_size", "--always_compact", "--max_old_space_size=128"]

CMD ["node_modules/@atomist/automation-client/start.client.js"]